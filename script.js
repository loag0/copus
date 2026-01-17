document.addEventListener("DOMContentLoaded", () => {
  const uploadArea = document.getElementById("upload-area");
  const fileElem = document.getElementById("fileElem");
  const conversionArea = document.querySelector(".conversion-area");
  const downloadArea = document.querySelector(".download-area");
  const convertButton = document.getElementById("convert-button");
  const downloadButton = downloadArea.querySelector(".download-button");

  let currentFile = null;

  // for drag and drop functionality

  document.addEventListener("dragover", (e) => e.preventDefault());
  document.addEventListener("drop", (e) => e.preventDefault());

  uploadArea.addEventListener("click", () => fileElem.click());
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
    handleFiles(e.dataTransfer.files);
  });
  fileElem.addEventListener("change", (e) => handleFiles(e.target.files));
  convertButton.addEventListener("click", () => convertFile());

  function handleFiles(files) {
    const mp3Files = Array.from(files).filter(
      (file) =>
        file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3")
    );
    if (!mp3Files.length) return alert("please upload valid MP3 files.");

    currentFile = mp3Files[0];

    // Fade out upload area
    uploadArea.classList.add("fade-out");

    setTimeout(() => {
      uploadArea.style.display = "none";
      uploadArea.classList.remove("fade-out");
      conversionArea.style.display = "flex";

      // Fade in conversion area
      setTimeout(() => {
        conversionArea.classList.add("show");
      }, 50);

      displayFileInConversion(currentFile);
    }, 400);
  }

  function displayFileInConversion(file) {
    conversionArea.querySelector(".file-name").textContent = file.name;
    conversionArea.querySelector(".file-size").textContent =
      (file.size / 1024 / 1024).toFixed(2) + " MB";
  }

  const spinner = document.getElementById("spinner");

  async function convertFile() {
    if (!currentFile) return alert("No file selected!");

    const format = document.querySelector('select[name="formats"]').value;
    const formData = new FormData();
    formData.append("file", currentFile);
    formData.append("format", format);

    convertButton.disabled = true;
    convertButton.textContent = "converting...";
    spinner.style.display = "flex";

    try {
      const response = await fetch("/convert", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("conversion failed");

      const data = await response.json();

      //const blob = await response.blob();
      //json returned instead of blob because it was failing on mobile

      if (!data.url) throw new Error("no download url");

      // fade out conversion area
      conversionArea.classList.remove("show");

      setTimeout(() => {
        conversionArea.style.display = "none";
        downloadArea.style.display = "flex";

        setTimeout(() => {
          downloadArea.classList.add("show");
        }, 50);

        displayFileInDownload(currentFile, format, data.url, data.size);
      }, 400);
    } catch (err) {
      console.error(err);
      alert("conversion failed");
      convertButton.disabled = false;
      convertButton.textContent = "convert";
      spinner.style.display = "none";
    }
  }

  function displayFileInDownload(file, format, downloadUrl, size) {
    const newFileName = file.name.replace(".mp3", `.${format}`);
    downloadArea.querySelector(".file-name").textContent = newFileName;

    const fileSizeElement = downloadArea.querySelector("h3");
    if (fileSizeElement && size) {
      fileSizeElement.textContent = (size / 1024 / 1024).toFixed(2) + " MB";
    }

    downloadButton.onclick = () => {
      window.location.href = downloadUrl;
    };
  }
});
