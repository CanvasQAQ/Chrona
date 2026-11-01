import { WAVEFORM_PALETTES, type DataLabelColor, type Signal, type WaveformPalette } from "../../domain/timing";

const CANVAS_GUTTER = 18;

interface ExportTrackLayout {
  height: number;
  signal: Signal;
  y: number;
}

interface ExportRange {
  endPs: number;
  startPs: number;
}

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const EXPORTED_STYLE_PROPERTIES = [
  "fill",
  "stroke",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
  "display",
  "font-family",
  "font-size",
  "font-weight",
  "letter-spacing",
  "paint-order",
  "vector-effect",
] as const;

function inlineSvgStyles(
  sourceSvg: SVGSVGElement,
  clonedSvg: SVGSVGElement,
) {
  const sourceElements: Element[] = [
    sourceSvg,
    ...Array.from(sourceSvg.querySelectorAll("*")),
  ];
  const clonedElements: Element[] = [
    clonedSvg,
    ...Array.from(clonedSvg.querySelectorAll("*")),
  ];

  sourceElements.forEach((sourceElement, index) => {
    const clonedElement = clonedElements[index];
    if (!clonedElement) return;
    const computed = getComputedStyle(sourceElement);
    let styles = EXPORTED_STYLE_PROPERTIES.map(
      (property) => `${property}:${computed.getPropertyValue(property)}`,
    ).join(";");
    const tokenColor = computed.getPropertyValue("--token-color").trim();
    if (tokenColor) styles += `;--token-color:${tokenColor}`;
    clonedElement.setAttribute("style", styles);
  });
}

function usePrintPalette(svg: SVGSVGElement, palette: WaveformPalette) {
  const colors = WAVEFORM_PALETTES[palette];
  const pairs = [
    ...(colors.darkSignal ?? []).map((dark, index) => [dark, colors.signal[index]]),
    ...(colors.darkToken ?? []).map((dark, index) => [dark, colors.token[index]]),
  ] as [string, string][];
  if (!pairs.length) return;

  const replacements = new Map<string, string>();
  for (const [dark, light] of pairs) {
    replacements.set(dark.toLowerCase(), light);
    const channels = dark.match(/[\da-f]{2}/gi)?.map((channel) => parseInt(channel, 16));
    if (channels?.length === 3) {
      replacements.set(`rgb(${channels.join(", ")})`, light);
    }
  }

  for (const element of svg.querySelectorAll<SVGElement>("[style]")) {
    let style = element.getAttribute("style") ?? "";
    for (const [dark, light] of replacements) {
      style = style.replaceAll(dark, light);
    }
    element.setAttribute("style", style);
  }
}

export function buildStandaloneSvg(
  sourceSvg: SVGSVGElement,
  layouts: ExportTrackLayout[],
  sourceWidth: number,
  height: number,
  labelWidth: number,
  range: ExportRange,
  durationPs: number,
  outputTimelineWidth: number,
  dataLabelColor: DataLabelColor,
  waveformPalette: WaveformPalette,
  darkTheme: boolean,
): string {
  const contrastPalette = waveformPalette === "contrast16" || waveformPalette === "contrast24";
  const monochrome = waveformPalette === "monochrome";
  const darkExport = darkTheme && (contrastPalette || waveformPalette === "vivid" || monochrome);
  const backgroundColor = darkExport
    ? monochrome ? "#000000" : contrastPalette ? "#101824" : "#0d0e14"
    : contrastPalette ? "#f7f9fc" : "#ffffff";
  const labelBackgroundColor = darkExport
    ? monochrome ? "#080808" : contrastPalette ? "#172333" : "#15161e"
    : contrastPalette ? "#eef3f8" : "#f8f8fb";
  const gridColor = darkExport
    ? monochrome ? "#383838" : contrastPalette ? "#34455a" : "#343643"
    : contrastPalette ? "#d6dee8" : "#dfe1e8";
  const minorGridColor = darkExport
    ? monochrome ? "#252525" : contrastPalette ? "#263447" : "#252733"
    : contrastPalette ? "#e2e8f0" : "#f0f1f5";
  const primaryTextColor = darkExport
    ? "#ffffff"
    : contrastPalette ? "#273142" : "#20212b";
  const secondaryTextColor = darkExport
    ? monochrome ? "#bfbfbf" : contrastPalette ? "#b3c1d0" : "#a5a7b5"
    : contrastPalette ? "#5b6878" : "#686a78";
  const safeDuration = Math.max(1, durationPs);
  const startRatio = Math.max(0, Math.min(1, range.startPs / safeDuration));
  const endRatio = Math.max(startRatio, Math.min(1, range.endPs / safeDuration));
  const sourceTimelineWidth = Math.max(1, sourceWidth - CANVAS_GUTTER * 2);
  const sourceStartX = startRatio === 0 ? 0 : CANVAS_GUTTER + startRatio * sourceTimelineWidth;
  const sourceEndX = endRatio === 1 ? sourceWidth : CANVAS_GUTTER + endRatio * sourceTimelineWidth;
  const sourceRangeWidth = Math.max(1, sourceEndX - sourceStartX);
  const exported = document.createElementNS(SVG_NAMESPACE, "svg");
  exported.setAttribute("xmlns", SVG_NAMESPACE);
  exported.setAttribute("width", String(labelWidth + outputTimelineWidth));
  exported.setAttribute("height", String(height));
  exported.setAttribute(
    "viewBox",
    `0 0 ${labelWidth + outputTimelineWidth} ${height}`,
  );

  const background = document.createElementNS(SVG_NAMESPACE, "rect");
  background.setAttribute("width", "100%");
  background.setAttribute("height", "100%");
  background.setAttribute("fill", backgroundColor);
  exported.appendChild(background);

  const labelBackground = document.createElementNS(SVG_NAMESPACE, "rect");
  labelBackground.setAttribute("width", String(labelWidth));
  labelBackground.setAttribute("height", String(height));
  labelBackground.setAttribute("fill", labelBackgroundColor);
  exported.appendChild(labelBackground);

  const labelDivider = document.createElementNS(SVG_NAMESPACE, "line");
  labelDivider.setAttribute("x1", String(labelWidth));
  labelDivider.setAttribute("x2", String(labelWidth));
  labelDivider.setAttribute("y1", "0");
  labelDivider.setAttribute("y2", String(height));
  labelDivider.setAttribute("stroke", gridColor);
  exported.appendChild(labelDivider);

  const axisLabel = document.createElementNS(SVG_NAMESPACE, "text");
  axisLabel.setAttribute("x", "13");
  axisLabel.setAttribute("y", "25");
  axisLabel.setAttribute("fill", secondaryTextColor);
  axisLabel.setAttribute("font-size", "9");
  axisLabel.setAttribute("font-family", "Inter, Arial, sans-serif");
  axisLabel.setAttribute("font-weight", "700");
  axisLabel.textContent = "SIGNAL";
  exported.appendChild(axisLabel);

  layouts.forEach(({ height: trackHeight, signal, y }) => {
    const divider = document.createElementNS(SVG_NAMESPACE, "line");
    divider.setAttribute("x1", "0");
    divider.setAttribute("x2", String(labelWidth));
    divider.setAttribute("y1", String(y + trackHeight - 1));
    divider.setAttribute("y2", String(y + trackHeight - 1));
    divider.setAttribute("stroke", gridColor);
    exported.appendChild(divider);

    const label = document.createElementNS(SVG_NAMESPACE, "text");
    label.setAttribute("x", "13");
    label.setAttribute("y", String(y + trackHeight / 2 + 4));
    label.setAttribute("fill", primaryTextColor);
    label.setAttribute("font-size", "11");
    label.setAttribute("font-family", "Inter, Arial, sans-serif");
    label.setAttribute("font-weight", "700");
    label.textContent = signal.name;
    exported.appendChild(label);
  });

  const clonedCanvas = sourceSvg.cloneNode(true) as SVGSVGElement;
  inlineSvgStyles(sourceSvg, clonedCanvas);
  if (darkTheme && !darkExport) usePrintPalette(clonedCanvas, waveformPalette);
  clonedCanvas.setAttribute("x", String(labelWidth));
  clonedCanvas.setAttribute("y", "0");
  clonedCanvas.setAttribute("width", String(outputTimelineWidth));
  clonedCanvas.setAttribute("height", String(height));
  clonedCanvas.setAttribute(
    "viewBox",
    `${sourceStartX} 0 ${sourceRangeWidth} ${height}`,
  );
  clonedCanvas.setAttribute("preserveAspectRatio", "none");

  clonedCanvas
    .querySelectorAll<SVGElement>(".canvas-background")
    .forEach((element) => element.style.setProperty("fill", backgroundColor));
  clonedCanvas
    .querySelectorAll<SVGElement>(".grid-minor")
    .forEach((element) => element.style.setProperty("stroke", minorGridColor));
  clonedCanvas
    .querySelectorAll<SVGElement>(".grid-major, .row-divider")
    .forEach((element) => element.style.setProperty("stroke", gridColor));
  clonedCanvas
    .querySelectorAll<SVGElement>(".axis line")
    .forEach((element) => element.style.setProperty("stroke", darkExport ? secondaryTextColor : contrastPalette ? "#b8c5d4" : "#c8cad3"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".axis text")
    .forEach((element) => element.style.setProperty("fill", secondaryTextColor));
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-high-z-line")
    .forEach((element) => element.style.setProperty("stroke", secondaryTextColor));
  clonedCanvas
    .querySelectorAll<SVGElement>(".bus-summary-shape")
    .forEach((element) => {
      element.style.setProperty("fill", darkExport ? "#2d2946" : "#eee8fa");
      element.style.setProperty("stroke", darkExport ? "#ae9bde" : "#8265c1");
    });
  clonedCanvas
    .querySelectorAll<SVGElement>(".bus-summary-rails")
    .forEach((element) => element.style.setProperty("stroke", darkExport ? "#766aab" : "#b9a4e2"));
  clonedCanvas.querySelectorAll<SVGPathElement>(".bus-mixed-base").forEach(path => {
    path.style.fill = darkExport ? "#303039" : "#f0f0f2";
    path.style.stroke = secondaryTextColor;
  });
  clonedCanvas.querySelectorAll<SVGPathElement>(".bus-mixed-window").forEach(window => {
    // Keep hatch references local when the exported SVG is opened as a separate file.
    window.style.fill = window.getAttribute("fill") ?? "none";
    window.style.stroke = "none";
  });
  clonedCanvas.querySelectorAll<SVGElement>(".bus-hatch-line").forEach(line => { line.style.stroke = secondaryTextColor; });
  clonedCanvas
    .querySelectorAll<SVGElement>(".bus-summary-label")
    .forEach((element) => element.style.setProperty("fill", darkExport ? "#d8cff2" : "#5f478e"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-state-label")
    .forEach((element) => {
      if (waveformPalette === "monochrome" || dataLabelColor === "contrast") {
        element.style.setProperty("fill", primaryTextColor);
      } else if (dataLabelColor === "muted") {
        element.style.setProperty("fill", secondaryTextColor);
      }
      element.style.setProperty("stroke", backgroundColor);
    });
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-symbol-shape")
    .forEach((element) => {
      if (monochrome) {
        element.style.setProperty("fill", backgroundColor);
        element.style.setProperty("stroke", darkExport ? "#ffffff" : "#111111");
        return;
      }
      if (contrastPalette) {
        const tokenColor = element.parentElement?.style.getPropertyValue("--token-color");
        if (tokenColor) {
          element.style.setProperty("fill", `${tokenColor}${darkExport ? "1c" : "0d"}`);
          element.style.setProperty("stroke", tokenColor);
        }
        return;
      }
      const tokenColor =
        element.parentElement?.style.getPropertyValue("--token-color");
      if (!tokenColor) return;
      element.style.setProperty(
        "fill",
        ["document", "research", "coastal", "mineral", "graphite"].includes(waveformPalette)
          ? `${tokenColor}12`
          : `${tokenColor}22`,
      );
      element.style.setProperty("stroke", tokenColor);
    });
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-symbol-label")
    .forEach((element) => {
      if (waveformPalette === "monochrome" || dataLabelColor === "contrast") {
        element.style.setProperty("fill", primaryTextColor);
        return;
      }
      if (dataLabelColor === "muted") {
        element.style.setProperty("fill", secondaryTextColor);
        return;
      }
      const tokenColor =
        element.parentElement?.style.getPropertyValue("--token-color");
      if (tokenColor) element.style.setProperty("fill", tokenColor);
    });

  if (monochrome) {
    clonedCanvas
      .querySelectorAll<SVGElement>(".grid-minor, .grid-major")
      .forEach((element) => element.style.setProperty("stroke", darkExport ? gridColor : "#e1e1e1"));
    clonedCanvas
      .querySelectorAll<SVGElement>(".axis line, .axis text, .data-high-z-line, .unknown-hatch-line")
      .forEach((element) => {
        element.style.setProperty(
          element.tagName.toLowerCase() === "text" ? "fill" : "stroke",
          darkExport ? "#ffffff" : "#111111",
        );
      });
    clonedCanvas
      .querySelectorAll<SVGElement>(".data-unknown-fill")
      .forEach((element) => {
        element.style.setProperty("fill", backgroundColor);
        element.style.setProperty("stroke", darkExport ? "#ffffff" : "#111111");
      });
  }

  exported.appendChild(clonedCanvas);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(exported)}`;
}
