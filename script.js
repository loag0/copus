document.addEventListener("DOMContentLoaded", () => {
  const uploadArea = document.getElementById("upload-area");
  const fileElem = document.getElementById("fileElem");

  uploadArea.addEventListener("click", () => {
    fileElem.click();
  });

  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.add("dragover");
  });

  uploadArea.addEventListener("dragleave", (e) => {
    e.stopPropagation();
    uploadArea.classList.remove("dragover");
  });

  uploadArea.addEventListener("drop", (e) => {
    e.preventDefault();
    e.stopPropagation();
    uploadArea.classList.remove("dragover");
  });

  fileElem.addEventListener("change", (e) => {
    handleFiles(e.target.files);
  });

  function handleFiles(files) {
    const mp3Files = Array.from(files).filter(
      (file) =>
        file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3")
    );

    if (mp3Files.length > 0) {
      displayFiles(mp3Files);
    } else {
      alert("please upload valid MP3 files.");
    }
  }
  function displayFiles(files) {
    files.forEach((file) => {
      console.log(`File: ${file.name}, Size: ${file.size} bytes`);
    });
  }
});
