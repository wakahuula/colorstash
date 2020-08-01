const savedColors = document.getElementById("savedColors");

const preview = document.getElementById("preview");

const colorInput = document.getElementById("colorInput");
colorInput.addEventListener("input", updateColor);
colorInput.addEventListener("keyup", saveColor);
colorInput.focus();

/* Main entry point for the input field */
function updateColor(e) {
  var color = e.target.value;
  if (!color) {
    color = "#446ccf";
  }
  preview.style.backgroundColor = "#" + color;
}

function saveColor(e) {
  if (e.keyCode === 13) {
    let color = e.target.value;
    if (!isColor(color)) return;
    if (isColorSaved(color)) return;
    createColorCard(color);
    saveColorToStash(color);
  }
}

/* Creates a color card */
function createColorCard(color) {
  let div = document.createElement("div");
  div.setAttribute("class", "savedColor");
  div.setAttribute("style", "background: #" + color);
  div.setAttribute("title", "#" + color);
  div.setAttribute("savedColor", color);
  div.addEventListener("click", activateColor);
  savedColors.appendChild(div);
}

/* Sets the selected color as the current one */
function activateColor(e) {
  let savedColor = e.target;
  let color = savedColor.getAttribute("savedColor");

  colorInput.value = color;
  preview.style.backgroundColor = "#" + color;
}

function isColor(color) {
  var s = new Option().style;
  s.color = "#" + color;
  return s.color !== "";
}

/* Checks if we already saved the color */
function isColorSaved(color) {
  const children = savedColors.children;
  for (let i = 0; i < children.length; i++) {
    let child = children[i];
    if (child.getAttribute("savedColor") === color) return true;
  }
  return false;
}

function loadColorStash() {
  let savedColorStash =
    JSON.parse(localStorage.getItem("savedColorStash")) || [];
  for (let i = 0; i < savedColorStash.length; i++) {
    createColorCard(savedColorStash[i]);
  }
}

function saveColorToStash(color) {
  let savedColorStash =
    JSON.parse(localStorage.getItem("savedColorStash")) || [];
  savedColorStash.push(color);
  localStorage.setItem("savedColorStash", JSON.stringify(savedColorStash));
}
