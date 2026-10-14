import { useEffect, useRef, useState } from "react";

const MAX_SIZE = 10 * 1024 * 1024;

const FORMATS = [{ value: "opus" }, { value: "ogg" }, { value: "wav" }];
const AUDIO_EXTENSION = /\/(mp3|opus|ogg|wav)$/i;

function formatFileSize(size) {
  if (size < 1024) return `${size} ${size === 1 ? "byte" : "bytes"}`;

  const kb = size / 1024;

  if (kb < 10) return `${kb.toFixed(1)} kB`;
  if (kb < 1024) return `${Math.round(kb)} kB`;

  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

function sanitizeFileName(name) {
  return name
    .replace(AUDIO_EXTENSION, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
    .replace(/[. ]+$/g, "")
    .trim()
    .slice(0, 180);
}

async function readApiError(response) {
  const data = await response.json().catch(() => ({}));

  if(typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }

  return response.status >= 500
    ? "we couldn't complete that request ooopsiieeees. please try again shortly."
    : "yikes! looks like we couldn't process your request. please check your file and try again";
}

function Toast({ toast, onDismiss, onPause, onResume }) {
  if (!toast) return null;

  return (
    <div
      key={toast.id}
      className={`toast toast-${toast.type}`}
      role={toast.type === "error" ? "alert" : "status"}
      onMouseEnter={onPause}
      onMouseLeave={onResume}
      onFocus={onPause}
      onBlur={onResume}
    >
      <span className="toast-icon" aria-hidden="true">
        {toast.type === "error" ? (
          <svg viewBox="0 0 52 52">
            <circle
              className="toast-error-circle"
              cx="26"
              cy="26"
              r="24"
              pathLength="1"
            />
            <path
              className="toast-error-cross"
              d="M18 18l16 16M34 18L18 34"
              pathLength="1"
            />
          </svg>
        ) : (
          <svg viewBox="0 0 52 52">
            <circle
              className="toast-success-circle"
              cx="26"
              cy="26"
              r="24"
              pathLength="1"
            />
            <path
              className="toast-success-check"
              d="M15 27l8 8 14-16"
              pathLength="1"
            />
          </svg>
        )}
      </span>

      <div className="toast-content">
        <p className="toast-title">{toast.title}</p>
        <p className="toast-message">{toast.message}</p>
      </div>

      <button
        type="button"
        className="toast-dismiss"
        aria-label="Dismiss notification"
        onClick={onDismiss}
      >
        &times;
      </button>
    </div>
  );
}

function App() {
  const fileInputRef = useRef(null);
  const panelRef = useRef(null);
  const toastTimeoutRef = useRef(null);

  const [currentFile, setCurrentFile] = useState(null);
  const [format, setFormat] = useState("opus");
  const [isConverting, setIsConverting] = useState(false);
  const [convertedFile, setConvertedFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [view, setView] = useState("upload");
  const [isRenameOpen, setIsRenameOpen] = useState(false);
  const [outputName, setOutputName] = useState("");
  const [toast, setToast] = useState(null);

  function startToastTimer(ms) {
    clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), ms);
  }

  function showToast(message, type = "error", title) {
    setToast({
      id: Date.now(),
      message,
      type,
      title: title || (type === "error" ? "error" : "success"),
    });
    startToastTimer(Math.max(4000, message.length * 60));
  }

  function pauseToast() {
    clearTimeout(toastTimeoutRef.current);
  }

  function resumeToast() {
    startToastTimer(2000);
  }

  function dismissToast() {
    clearTimeout(toastTimeoutRef.current);
    setToast(null);
  }

  useEffect(() => {
    return () => clearTimeout(toastTimeoutRef.current);
  }, []);

  // Move focus into the new panel.
  useEffect(() => {
    if (view === "conversion" || view === "download") {
      panelRef.current?.focus();
    }
  }, [view]);

  function handleFiles(files) {
    const mp3Files = Array.from(files).filter(
      (file) =>
        file.type === "audio/mpeg" || file.name.toLowerCase().endsWith(".mp3"),
    );

    if (!mp3Files.length) {
      showToast("choose an mp3 file before converting.", "error", "no file selected");
      return;
    }

    const file = mp3Files[0];

    if (file.size > MAX_SIZE) {
      showToast(
        `that file is ${formatFileSize(file.size)}. the limit is 10 MB bro.`,
        "error",
        "file too large"
      );
      return;
    }

    setCurrentFile(file);
    setOutputName(file.name.replace(/\.mp3$/i, ""));
    setIsRenameOpen(false);
    setView("upload-exiting");

    setTimeout(() => {
      setView("conversion");
    }, 400);
  }

  function handleFileChange(event) {
    handleFiles(event.target.files);
    event.target.value = "";
  }

  function handleDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    setIsDragging(false);

    handleFiles(event.dataTransfer.files);
  }

  async function convertFile() {
    if (!currentFile) {
      showToast("choose an mp3 file before converting.", "error");
      return;
    }

    const safeName = sanitizeFileName(outputName);

    if (!safeName) {
      showToast(
        "nah dawg, thats not a valid name.",
        "error",
        "invalid filename",
      );
      return;
    }

    const formData = new FormData();
    formData.append("file", currentFile);
    formData.append("format", format);
    formData.append("filename", safeName);

    setIsConverting(true);

    try {
      const response = await fetch("/convert", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const message = await readApiError(response);
        showToast(message);
        setIsConverting(false);
        return;
      }

      const data = await response.json().catch(() => null);

      if (!data?.url || !data?.filename) {
        showToast(
          "conversion finished, but we couldn't prepare your download. please try again.",
        );
        setIsConverting(false);
        return;
      }

      setConvertedFile({
        name: data.filename,
        size: data.size,
        url: data.url,
      });

      setView("conversion-exiting");

      setTimeout(() => {
        setView("download");
        setIsConverting(false);
      }, 400);
    } catch (err) {
      console.error("conversion request failed:", err);

      showToast(
        "couldn't connect to copus. check your connection and try again.",
        "connection failed",
      );

      setIsConverting(false);
    }
  }

  function downloadFile() {
    if (!convertedFile?.url) {
      showToast(
        "download link is missing. try converting your file again.",
        "error",
      );
      return;
    }

    const link = document.createElement("a");
    link.href = convertedFile.url;
    link.download = convertedFile.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function reset() {
    setCurrentFile(null);
    setConvertedFile(null);
    setIsConverting(false);
    setFormat("opus");
    setOutputName("");
    setIsRenameOpen(false);
    setView("upload");
  }

  const defaultName = currentFile
    ? currentFile.name.replace(AUDIO_EXTENSION, "")
    : "";
  const savedName = sanitizeFileName(outputName);
  const isRenamed = savedName !== sanitizeFileName(defaultName);

  return (
    <main className="body">
      <Toast
        toast={toast}
        onDismiss={dismissToast}
        onPause={pauseToast}
        onResume={resumeToast}
      />

      <div className="container">
        <h1 className="main-text">copus file converter</h1>

        <p className="sub-text">convert mp3 files to opus, ogg, or wav</p>

        {(view === "upload" || view === "upload-exiting") && (
          <div
            className={`upload-area ${
              view === "upload-exiting" ? "fade-out" : ""
            } ${isDragging ? "dragover" : ""}`}
            role="button"
            tabIndex={0}
            aria-label="upload an mp3 file"
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setIsDragging(true);
            }}
            onDragLeave={(event) => {
              event.stopPropagation();

              if (!event.currentTarget.contains(event.relatedTarget)) {
                setIsDragging(false);
              }
            }}
            onDrop={handleDrop}
          >
            <div className="upload-icon">
              <img src="/assets/upload.svg" alt="" />
            </div>

            <h2>click to upload or drag a file into me</h2>

            <input
              ref={fileInputRef}
              type="file"
              accept=".mp3,audio/mpeg"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />

            <p>max upload size is 10MB</p>
          </div>
        )}

        {(view === "conversion" || view === "conversion-exiting") && (
          <section
            ref={panelRef}
            tabIndex={-1}
            aria-label="conversion options"
            className={`conversion-area ${
              view === "conversion-exiting" ? "fade-out" : ""
            }`}
          >
            <div className="file-details">
              <span className="file-name">{currentFile?.name}</span>

              <p className="file-meta">
                {currentFile && formatFileSize(currentFile.size)}
              </p>
            </div>

            <div
              className="format-section"
              role="radiogroup"
              aria-labelledby="format-label"
            >
              <p id="format-label" className="format-label">
                convert to
              </p>

              <div className="format-options">
                {FORMATS.map(({ value }) => (
                  <label
                    key={value}
                    className={`format-option ${
                      format === value ? "selected" : ""
                    }`}
                  >
                    <input
                      type="radio"
                      name="format"
                      value={value}
                      checked={format === value}
                      onChange={() => setFormat(value)}
                      disabled={isConverting}
                    />

                    <span className="format-name">{value}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="rename-section">
              <button
                type="button"
                className="rename-toggle"
                onClick={() => setIsRenameOpen((open) => !open)}
                aria-expanded={isRenameOpen}
                disabled={isConverting}
              >
                <span>rename file (optional)</span>

                {!isRenameOpen && isRenamed && savedName && (
                  <span className="rename-value">
                    {savedName}.{format}
                  </span>
                )}

                <span
                  className={`rename-chevron ${isRenameOpen ? "open" : ""}`}
                  aria-hidden="true"
                >
                  &#8250;
                </span>
              </button>

              {isRenameOpen && (
                <div className="filename-input-wrapper">
                  <input
                    id="output-name"
                    className="filename-input"
                    type="text"
                    value={outputName}
                    onChange={(event) => setOutputName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") convertFile();
                    }}
                    autoFocus
                    maxLength={180}
                    disabled={isConverting}
                    aria-label="Output filename without extension"
                    placeholder="enter a file name"
                  />

                  <span className="filename-extension">.{format}</span>
                </div>
              )}
            </div>

            <button
              className="convert-button"
              onClick={convertFile}
              disabled={isConverting}
              aria-busy={isConverting}
            >
              {isConverting ? "converting..." : "convert"}
            </button>
          </section>
        )}

        {view === "download" && convertedFile && (
          <section
            ref={panelRef}
            tabIndex={-1}
            aria-label="converted file"
            className="download-area"
          >
            <div className="success-mark" aria-hidden="true">
              <svg viewBox="0 0 52 52">
                <circle
                  className="success-circle"
                  cx="26"
                  cy="26"
                  r="24"
                  pathLength="1"
                />

                <path
                  className="success-check"
                  d="M15 27l8 8 14-16"
                  pathLength="1"
                />
              </svg>
            </div>

            <div className="success-text">
              <p className="success-title" role="status">
                your file is ready
              </p>

              <p className="file-name">{convertedFile.name}</p>
            </div>

            <div className="compare">
              <div className="compare-cell">
                <p className="compare-label">original</p>

                <p className="compare-size">
                  {formatFileSize(currentFile.size)}
                </p>

                <p className="compare-format">mp3</p>
              </div>

              <span className="compare-arrow" aria-hidden="true">
                →
              </span>

              <div className="compare-cell converted">
                <p className="compare-label">converted</p>

                <p className="compare-size">
                  {formatFileSize(convertedFile.size)}
                </p>

                <p className="compare-format">{format}</p>
              </div>
            </div>

            <button className="download-button" onClick={downloadFile}>
              download
            </button>

            <button className="secondary-button" onClick={reset}>
              convert another
            </button>
          </section>
        )}
      </div>
    </main>
  );
}

export default App;
