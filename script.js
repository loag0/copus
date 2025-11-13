document.addEventListener("DOMContentLoaded", () => {
  const uploadArea = document.getElementById("upload-area");
  const fileElem = document.getElementById("fileElem");
  const conversionArea = document.querySelector(".conversion-area");
  const downloadArea = document.querySelector(".download-area");
  const convertButton = document.getElementById("convert-button");

  let currentFile = null;

  document.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  document.addEventListener("drop", (e) => {
    e.preventDefault();
  });

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

    const files = e.dataTransfer.files;
    handleFiles(files);
  });

  fileElem.addEventListener("change", (e) => {
    handleFiles(e.target.files);
  });

  convertButton.addEventListener("click", () => {
    convertFile();
  });
  downloadButton.addEventListener("click", () => {downloadFile()})

  function handleFiles(files) {
    const mp3Files = Array.from(files).filter(
      (file) =>
        file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3")
    );

    if (mp3Files.length > 0) {
      // Store the first file
      currentFile = mp3Files[0];

      // Hide upload area, show conversion area
      uploadArea.style.display = "none";
      conversionArea.style.display = "flex";

      displayFileInConversion(currentFile);
    } else {
      alert("please upload valid MP3 files.");
    }
  }

  function displayFileInConversion(file) {

    const fileName = conversionArea.querySelector("#file-name");
    fileName.textContent = file.name;

    const fileSize = conversionArea.querySelector("#file-size");
    const sizeInMB = (file.size / 1024 / 1024).toFixed(2);
    fileSize.textContent = `${sizeInMB} MB`;
  }

  async function convertFile() {
    if (!currentFile) {
      alert("No file selected!");
      return;
    }

    const formatSelect = document.querySelector('select[name="formats"]');
    const selectedFormat = formatSelect.value;

    if(selectedFormat === "opus"){
      //opus conversion logic
    }
    else{
      //ogg logik
    }

    console.log(`Converting ${currentFile.name} to ${selectedFormat}...`);

    const formData = new FormData();
    formData.append("file", currentFile);
    formData.append("format", selectedFormat);

    try{
      const response = await fetch("http://localhost:5500", {
      method: 'POST',
      body: formData,
    })
    if(!response.ok){
      throw new Error("conversion failed");
    }
    
    const blob = await response.blob();

    conversionArea.style.display = "none";
    downloadArea.style.display = "flex";

    displayFileInDownload(currentFile, selectedFormat);
  }
  catch(error){
    console.error("Error: ", error);
    alert("conversion failed");
  }
    // Here you would add your actual file conversion logic bro
  }

  function displayFileInDownload(file, format, convertedBlob) {

    const fileName = downloadArea.querySelector("#file-name");
    const newFileName = file.name.replace(".mp3", `.${format}`);
    fileName.textContent = newFileName;

    const fileSize = downloadArea.querySelector("#file-size");
    const sizeInMB = (file.size / 1024 / 1024).toFixed(2);
    fileSize.textContent = `${sizeInMB} MB`;
   

    const downloadButton = document.querySelector('.download-area .convert-button');
    downloadButton.onclick = () => {
      const url = URL.createObjectURL(convertedBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = newFileName;
      a.click();
      URL.revokeObjectURL(url);
    }
  }
});