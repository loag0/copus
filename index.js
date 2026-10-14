const express = require("express");
const fs = require("fs");
const multer = require("multer");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
const rateLimit = require("express-rate-limit");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
app.set("trust proxy", 1);
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, "uploads");
const distDir = path.join(__dirname, "dist");

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const FILE_RETENTION_MS = 60 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
const MAX_DURATION_SECONDS = 15 * 60;
const CONVERSION_TIMEOUT_MS = 2 * 60 * 1000;
const MAX_CONCURRENT_CONVERSIONS = 2;

class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

fs.mkdirSync(uploadDir, { recursive: true });

app.use(express.static(distDir));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Generates unique internal filenames so uploads cannot overwrite one another.
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const uniqueId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    cb(null, `${uniqueId}${path.extname(file.originalname).toLowerCase()}`);
  },
});

const fileFilter = (req, file, cb) => {
  const extension = path.extname(file.originalname).toLowerCase();

  if (extension === ".mp3" && ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return cb(null, true);
  }

  cb(new AppError("please upload a valid mp3 file."));
};

// prefilter that checks if file is actually mp3
async function looksLikeMp3(filePath) {
  const handle = await fs.promises.open(filePath, "r");

  try {
    const buf = Buffer.alloc(3);
    await handle.read(buf, 0, 3, 0);

    const isId3 = buf.toString("latin1") === "ID3";
    const isFrameSync = buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0;

    return isId3 || isFrameSync;
  } finally {
    await handle.close();
  }
}

function toSeconds(timestamp) {
  const [h = 0, m = 0, s = 0] = String(timestamp || "")
    .split(":")
    .map(Number);
  const total = h * 3600 + m * 60 + s;
  return Number.isFinite(total) ? total : 0;
}

function convertAudio({ inputPath, outputPath, selectedFormat, res }) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      res.off("close", onClose);
      err ? reject(err) : resolve();
    };

    const command = ffmpeg(inputPath)
      .noVideo()
      .audioCodec(selectedFormat.codec)
      .format(selectedFormat.format)
      .on("codecData", (data) => {
        if (toSeconds(data.duration) > MAX_DURATION_SECONDS) {
          command.kill("SIGKILL");
          finish(
            new AppError(
              "that audio is too long. the limit is 15 minutes.",
              413,
            ),
          );
        }
      })
      .on("end", () => finish())
      .on("error", (err) => finish(err));

    // client left, stop burning cpu
    const onClose = () => {
      command.kill("SIGKILL");
      finish(new Error("client disconnected"));
    };
    res.once("close", onClose);

    timer = setTimeout(() => {
      command.kill("SIGKILL");
      finish(new AppError("that took too long. try a shorter file.", 504));
    }, CONVERSION_TIMEOUT_MS);

    command.save(outputPath);
  });
}

let activeConversions = 0;

// concurrency guard
function conversionSlot(req, res, next) {
  if (activeConversions >= MAX_CONCURRENT_CONVERSIONS) {
    res.set("Retry-After", "10");
    return res.status(503).json({
      error: "the server is busy right now. try again in a few seconds.",
    });
  }

  activeConversions++;
  res.once("close", () => {
    activeConversions--;
  });
  next();
}

const convertLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "too many conversions. try again in a few minutes." },
});

const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
    files: 1,
  },
  fileFilter,
});

const FORMATS = {
  opus: {
    extension: "opus",
    codec: "libopus",
    format: "opus"
  },
  ogg: {
    extension: "ogg",
    codec: "libvorbis",
    format: "ogg"
  },
  wav: {
    extension: "wav",
    codec: "pcm_s16le",
    format: "wav"
  },
};

const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp3",
  "audio/x-mpeg",
  "application/octet-stream",
  "",
]);

const AUDIO_EXTENSION = /\.(mp3|opus|ogg|wav)$/i;
const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

// Keep user-supplied names separate from internal storage filenames.
function sanitizeFilename(value) {
  if (typeof value !== "string") return "";

  const name = path
    .basename(value.trim())
    .replace(AUDIO_EXTENSION, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 180);

  return RESERVED_NAMES.test(name) ? `_${name}` : name;
}

function safeUnlink(filePath) {
  if (!filePath) return Promise.resolve();

  return fs.promises.unlink(filePath).catch((err) => {
    if (err.code !== "ENOENT") {
      console.error("File cleanup error:", err.message);
    }
  });
}

// Remove files left behind by interrupted conversions or abandoned downloads.
async function cleanExpiredFiles() {
  try {
    const files = await fs.promises.readdir(uploadDir);
    const now = Date.now();

    await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(uploadDir, file);

        try {
          const stats = await fs.promises.stat(filePath);

          if (stats.isFile() && now - stats.mtimeMs > FILE_RETENTION_MS) {
            await safeUnlink(filePath);
          }
        } catch (err) {
          if (err.code !== "ENOENT") {
            console.error("Cleanup error:", err.message);
          }
        }
      }),
    );
  } catch (err) {
    console.error("Could not clean uploads directory:", err.message);
  }
}

cleanExpiredFiles();

const cleanupTimer = setInterval(cleanExpiredFiles, CLEANUP_INTERVAL_MS);

cleanupTimer.unref();

// Convert an uploaded MP3.
app.post(
  "/convert",
  convertLimiter,
  conversionSlot,
  upload.single("file"),
  async (req, res) => {
    let inputPath = req.file?.path;
    let outputPath;

    try {
      if (!req.file) throw new AppError("please choose an mp3 file first.");

      if (!(await looksLikeMp3(inputPath))) {
        throw new AppError("that doesn't look like a real mp3 file.");
      }

      const selectedFormat =
        FORMATS[String(req.body.format || "").toLowerCase()];
      if (!selectedFormat) {
        throw new AppError("please select a supported output format.");
      }

      const rawName = Array.isArray(req.body.filename)
        ? req.body.filename.at(-1)
        : req.body.filename;

      const requestedName =
        rawName === undefined
          ? path.basename(
              req.file.originalname,
              path.extname(req.file.originalname),
            )
          : rawName;

      const safeName = sanitizeFilename(requestedName);
      if (!safeName)
        throw new AppError("please enter a valid output filename.");

      const { extension } = selectedFormat;
      const outputFilename = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${extension}`;
      outputPath = path.join(uploadDir, outputFilename);

      await convertAudio({ inputPath, outputPath, selectedFormat, res });

      await safeUnlink(inputPath);
      inputPath = null;

      const stats = await fs.promises.stat(outputPath);

      return res.json({
        success: true,
        filename: `${safeName}.${extension}`,
        url: `/download/${outputFilename}?name=${encodeURIComponent(`${safeName}.${extension}`)}`,
        size: stats.size,
      });
    } catch (err) {
      await Promise.all([safeUnlink(inputPath), safeUnlink(outputPath)]);

      if (res.destroyed || res.headersSent) return;

      if (err instanceof AppError) {
        return res.status(err.status).json({ error: err.message });
      }

      console.error("conversion error:", err.message);
      return res.status(500).json({
        error: "conversion failed. please try another mp3 file.",
      });
    }
  },
);

// Serve converted files without allowing arbitrary filesystem paths.
app.get("/download/:file", async (req, res) => {
  const filename = req.params.file;

  if (!/^[a-zA-Z0-9-]+\.(opus|ogg|wav)$/.test(filename)) {
    return res.status(400).json({ error: "invalid download link." });
  }

  const filePath = path.join(uploadDir, filename);

  try {
    await fs.promises.access(filePath, fs.constants.R_OK);
    const stats = await fs.promises.stat(filePath);

    if (!stats.isFile()) {
      return res.status(404).json({
        error: "converted file not found. please convert it again.",
      });
    }

    const requestedName = req.query.name;
    const safeDownloadName = sanitizeFilename(requestedName);
    const extension = path.extname(filename).toLowerCase();

    const downloadName = safeDownloadName
      ? `${safeDownloadName}${extension}`
      : filename;

    res.set("Cache-Control", "no-store");

    res.download(filePath, downloadName, (err) => {
      if (err && err.code !== "ECONNABORTED") {
        console.error("download error:", err.message);
      }
    });
  } catch (err) {
    if (err.code !== "ENOENT" && err.code !== "EACCES") {
      console.error("Download error:", err.message);
    }

    if (!res.headersSent) {
      return res.status(404).json({
        error: "converted file not found. please convert it again.",
      });
    }
  }
});

app.get("/{*path}", (req, res, next) => {
  res.sendFile(path.join(distDir, "index.html"), (err) => {
    if (err) next(err);
  });
});

// Handle upload errors that happen before the conversion route runs.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res
        .status(413)
        .json({ error: "file is too large. the maximum size is 10 mb." });
    }
    if (err.code === "LIMIT_FILE_COUNT") {
      return res
        .status(400)
        .json({ error: "please upload one file at a time." });
    }
    return res
      .status(400)
      .json({ error: "the uploaded file could not be processed." });
  }

  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message });
  }

  console.error("server error:", err.message);
  return res.status(500).json({
    error: "something went wrong on the server. please try again.",
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
