const express = require("express");
const fs = require("fs");
const cors = require("cors");
const multer = require("multer");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");

const app = express();

// setup CORS
app.use(
  cors({
    origin: "*",
    exposedHeaders: ["Content-Disposition"],
  })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// serve static files
app.use("/assets", express.static(path.join(__dirname, "assets")));
app.use("/styles.css", express.static(path.join(__dirname, "styles.css")));
app.use("/script.js", express.static(path.join(__dirname, "script.js")));

// serve index.html
app.get("/", (req, res) => {
  fs.readFile(path.join(__dirname, "index.html"), "utf8", (err, html) => {
    if (err) return res.status(500).send("I'll be back soon");
    res.send(html);
  });
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype === "audio/mpeg") cb(null, true);
  else cb(new Error("Only MP3 allowed"), false);
};

const upload = multer({
  dest: "uploads/",
  limits: { fileSize: 10 * 1024 * 1024 }, //this makes it so the max file size is 10MB
  fileFilter: fileFilter,
});


// conversion route
app.post("/convert", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const inputFile = req.file.path;
  const format = req.body.format;
  const outputPath = `${inputFile}.${format}`;
  let codec;

  if (format === "opus") codec = "libopus";
  else if (format === "ogg") codec = "libvorbis";
  else return res.status(400).json({ error: "Invalid format homeboy" });

  ffmpeg(inputFile)
    .audioCodec(codec)
    .toFormat(format)
    .on("end", () => {
      // send as blob with proper headers
      res.setHeader(
        "Content-Disposition",
        `attachment; filename=converted.${format}`
      );
      res.setHeader("Content-Type", `audio/${format}`);

      const readStream = fs.createReadStream(outputPath);
      readStream.pipe(res);

      readStream.on("close", () => {
        fs.existsSync(inputFile) && fs.unlinkSync(inputFile);
        fs.existsSync(outputPath) && fs.unlinkSync(outputPath);
      });
    })
    .on("error", (err) => {
      console.error("FFmpeg Error:", err);
      fs.existsSync(inputFile) && fs.unlinkSync(inputFile);
      res.status(500).json({ error: "Conversion failed" });
    })
    .save(outputPath);
});

// listen
app.listen(3000, () => {
  console.log("Server running at http://localhost:3000");
});
