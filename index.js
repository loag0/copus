const express = require("express");
const fs = require("fs");
const cors = require("cors");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");

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
  else cb(new Error("Only MP3 files allowed!"), false);
};

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, //this makes it so the max file size is 10MB
  fileFilter: fileFilter,
});

app.post("/convert", upload.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const inputFile = req.file.path;
  const format = req.body.format.toLowerCase();
  let codec, outputPath;

  if (format === "opus") {
    codec = "libopus";
    outputPath = inputFile + ".opus";
  } else if (format === "ogg") {
    codec = "libvorbis";
    outputPath = inputFile + ".ogg";
  } else {
    fs.unlinkSync(inputFile);
    return res.status(400).json({ error: "Invalid format" });
  }

  try {
    await new Promise((resolve, reject) => {
      ffmpeg(inputFile)
        .audioCodec(codec)
        .toFormat(format)
        .save(outputPath)
        .on("end", resolve)
        .on("error", reject);
    });

    res.download(
      outputPath,
      req.file.originalname.replace(".mp3", `.${format}`),
      (err) => {
        fs.existsSync(inputFile) && fs.unlinkSync(inputFile);
        fs.existsSync(outputPath) && fs.unlinkSync(outputPath);
        if (err) console.error("Download error:", err);
      }
    );
  } catch (err) {
    fs.existsSync(inputFile) && fs.unlinkSync(inputFile);
    console.error("Conversion error:", err);
    res.status(500).json({ error: "Conversion failed" });
  }
});


app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
