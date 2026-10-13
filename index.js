const express = require("express");
const fs = require("fs");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");

ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();
const PORT = process.env.PORT || 3000;

const uploadDir = path.join(__dirname, "uploads");
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const FILE_RETENTION_MS = 60 * 60 * 1000;

const distDir = path.join(__dirname, "dist");

fs.mkdirSync(uploadDir, { recursive: true });

app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Content-Disposition"],
  }),
);

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

  if (extension === ".mp3" && file.mimetype === "audio/mpeg") {
    return cb(null, true);
  }

  cb(new Error("please upload a valid mp3 file."));
};

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
  },
  ogg: {
    extension: "ogg",
    codec: "libvorbis",
  },
  wav: {
    extension: "wav",
    codec: "pcm_s16le",
  },
};

// Keep user-supplied names separate from internal storage filenames.
function sanitizeFilename(value) {
  if (typeof value !== "string") return "";

  return path
    .basename(value.trim())
    .replace(/\.[^.]*$/, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 180);
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

const cleanupTimer = setInterval(cleanExpiredFiles, 15 * 60 * 1000);

cleanupTimer.unref();

// Convert an uploaded MP3.
app.post("/convert", upload.single("file"), async (req, res) => {
  let inputPath = req.file?.path;
  let outputPath;

  try {
    if (!req.file) {
      return res.status(400).json({
        error: "please choose an mp3 file first.",
      });
    }

    const format = String(req.body.format || "").toLowerCase();
    const selectedFormat = FORMATS[format];

    if (!selectedFormat) {
      return res.status(400).json({
        error: "please select a supported output format.",
      });
    }

    const requestedName =
      req.body.filename === undefined
        ? path.basename(
            req.file.originalname,
            path.extname(req.file.originalname),
          )
        : req.body.filename;

    const safeName = sanitizeFilename(requestedName);

    if (!safeName) {
      return res.status(400).json({
        error: "please enter a valid output filename.",
      });
    }

    const { extension, codec } = selectedFormat;

    // The internal filename is unique. The download name is user-facing.
    const outputId = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    const outputFilename = `${outputId}.${extension}`;
    outputPath = path.join(uploadDir, outputFilename);

    await new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .noVideo()
        .audioCodec(codec)
        .on("end", resolve)
        .on("error", reject)
        .save(outputPath);
    });

    await safeUnlink(inputPath);
    inputPath = null;

    const stats = await fs.promises.stat(outputPath);

    return res.json({
      success: true,
      filename: `${safeName}.${extension}`,
      url: `/download/${outputFilename}?name=${encodeURIComponent(
        `${safeName}.${extension}`,
      )}`,
      size: stats.size,
    });
  } catch (err) {
    console.error("Conversion error:", err.message);

    await Promise.all([safeUnlink(inputPath), safeUnlink(outputPath)]);

    if (!res.headersSent) {
      return res.status(500).json({
        error: "conversion failed. please try another mp3 file.",
      });
    }
  }
});

// Serve converted files without allowing arbitrary filesystem paths.
app.get("/download/:file", async (req, res) => {
  const filename = req.params.file;

  if (!/^[a-zA-Z0-9-]+\.(opus|ogg|wav)$/.test(filename)) {
    return res.status(400).json({
      error: "Invalid download link.",
    });
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

    res.download(filePath, downloadName, (err) => {
      if (err) {
        console.error("Download error:", err.message);

        // Keep the file after a failed download so the user can retry.
        return;
      }

      // Delete only after a successful download.
      safeUnlink(filePath);
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

// Handle upload errors that happen before the conversion route runs.
app.use((err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        error: "file is too large. the maximum size is 10 MB.",
      });
    }

    if (err.code === "LIMIT_FILE_COUNT") {
      return res.status(400).json({
        error: "please upload one file at a time.",
      });
    }

    return res.status(400).json({
      error: "the uploaded file could not be processed.",
    });
  }

  if (err.message === "please upload a valid MP3 file.") {
    return res.status(400).json({
      error: err.message,
    });
  }

  console.error("Server error:", err.message);

  return res.status(500).json({
    error: "something went wrong on the server. please try again.",
  });
});

app.get("/{*path}", (req, res, next) => {
  res.sendFile(path.join(distDir, "index.html"), (err) => {
    if(err) next(err);
  });
})

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
