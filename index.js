const express = require("express");
const fs = require("fs");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegPath = require("ffmpeg-static");
ffmpeg.setFfmpegPath(ffmpegPath);

const app = express();

app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Content-Disposition"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/styles.css", express.static(path.join(__dirname, "styles.css")));
app.use("/script.js", express.static(path.join(__dirname, "script.js")));

// this gets index.html
app.get("/", (req, res) => {
  fs.readFile(path.join(__dirname, "index.html"), "utf8", (err, html) => {
    if (err) return res.status(500).send("I'll be back soon");
    res.send(html);
  });
});

const uploadDir = "uploads/";
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "audio/mpeg") cb(null, true);
  else cb(new Error("only mp3 files allowed!"), false);
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, //this makes it so the max file size is 10MB
  fileFilter: fileFilter,
});

app.post("/convert", upload.single("file"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "no file uploaded" });
  }

  const inputPath = req.file.path;
  const format = req.body.format?.toLowerCase();

  let ext, codec;
  if (format === "opus") {
    ext = "opus";
    codec = "libopus";
  } else if (format === "ogg") {
    ext = "ogg";
    codec = "libvorbis";
  } else {
    fs.unlinkSync(inputPath);
    return res.status(400).json({ error: "invalid format" });
  }

  const outputName = `${Date.now()}.${ext}`;
  const outputPath = path.join("uploads", outputName);

  ffmpeg(inputPath)
    .audioCodec(codec)
    .save(outputPath)
    .on("end", () => {
      fs.unlinkSync(inputPath);

      const size = fs.statSync(outputPath).size;

      res.json({
        success: true,
        filename: outputName,
        url: `/download/${outputName}?name=${encodeURIComponent(
          req.file.originalname.replace(".mp3", `.${ext}`),
        )}`,
        size
      });
    })
    .on("error", (err) => {
      console.error("ffmpeg error:", err);
      fs.existsSync(inputPath) && fs.unlinkSync(inputPath);
      res.status(500).json({ error: "conversion failed" });
    });
});

app.get("/download/:file", (req, res) => {
  const filePath = path.join("uploads", req.params.file);
  const originalname = req.query.name;

  if (!fs.existsSync(filePath)) {
    return res.status(404).send("file not found");
  }

  res.download(filePath, originalname || req.params.file, (err) => {
    if (err) console.error("download error:", err);
    fs.unlink(filePath, () => {});
  });
});

const PORT = process.env.PORT || 3000
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
