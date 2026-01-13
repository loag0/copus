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
      const response = await fetch("http://localhost:3000/convert", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Conversion failed");

      const blob = await response.blob();

      // Fade out conversion area
      conversionArea.classList.remove("show");

      setTimeout(() => {
        conversionArea.style.display = "none";
        downloadArea.style.display = "flex";

        // Fade in download area
        setTimeout(() => {
          downloadArea.classList.add("show");
        }, 50);

        displayFileInDownload(currentFile, format, blob);
      }, 400);
    } catch (err) {
      console.error(err);
      alert("conversion failed");
      convertButton.disabled = false;
      convertButton.textContent = "convert";
      spinner.style.display = "none";
    }
  }

  function displayFileInDownload(file, format, blob) {
    const newFileName = file.name.replace(".mp3", `.${format}`);
    downloadArea.querySelector(".file-name").textContent = newFileName;

    const fileSizeElement = downloadArea.querySelector(".file-size h3");
    if (fileSizeElement) {
      fileSizeElement.textContent =
        (blob.size / 1024 / 1024).toFixed(2) + " MB";
    }

    downloadButton.onclick = (e) => {
      e.preventDefault();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = newFileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    };
  }
});
