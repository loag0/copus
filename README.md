# copus - mp3 to opus/ogg converter

copus is a lightweight web app that lets you convert MP3 files to Opus or Ogg formats directly in your browser. It's built with Node.js, Express, ffmpeg, and a simple frontend for drag-and-drop file conversion.

# Features

- Drag-and-drop or click-to-upload MP3 files

- Convert MP3 to Opus or Ogg formats

- Shows file size and conversion progress

- Download the converted file instantly

- Simple, responsive, and lightweight UI

- CORS enabled for flexible use

# Tech Stack

+ Backend: Node.js, Express, Multer, ffmpeg

+ Frontend: HTML, CSS, JavaScript

+ File handling: Multer for uploads, Fluent-ffmpeg for audio conversion

+ Deployment: Can run locally or on platforms like Render

# Getting Started
## Prerequisites

- Node.js
 (v18+)

- ffmpeg
 installed and available in PATH

## Installation
### Clone repo
```
git clone https://github.com/loag0/copus.git
cd copus
```

### Install dependencies
```
npm install
```
### Running Locally
> [!TIP]
> Install nodemon for live server reloading
```
npm install -g nodemon
```
Start server
```
nodemon index.js
```
Otherwise use
```
node index.js
```

### Open your browser and go to:

http://localhost:3000


### Make sure you have ffmpeg installed; Copus uses it for file conversion.

# Folder Structure
```
copus/
│
├─ index.html
├─ index.js           # backend server
├─ package.json
├─ styles.css         # frontend styles
├─ script.js          # frontend logic
├─ assets/            # images, icons, favicon
│   ├─ upload.svg
│   └─ favicon.ico
└─ uploads/           # temporary uploaded files (auto-deleted after conversion)
```
# Usage

- Open the app in your browser.

- Drag-and-drop or click to upload an MP3 file.

- Select the target format (Opus or Ogg).

- Click Convert.

- Download the converted file.

- Security & Performance Notes

- Temporary files are deleted after conversion.

- Only MP3 files are allowed for upload.

- CORS is enabled for frontend flexibility.

## For production deployment, consider:

- Using HTTPS

- Limiting max upload size

- Rate limiting endpoints

- Running ffmpeg in a sandbox/container

# Deployment

You can host it on Render, Vercel, or any Node.js compatible server.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](
https://render.com/deploy?repo=https://github.com/loag0/copus
)


Make sure the server is accessible via HTTPS for secure file uploads/downloads.

# Recognition
This project was inspired by @[disara7](https://github.com/disara7), whose image format converter gave me the idea to make my own tool. I built copus to convert MP3s to Opus/OGG for my custom notification sounds, and now anyone can use it too!

# License

MIT License — feel free to use, modify, or share.
