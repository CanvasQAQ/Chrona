import type { Signal } from "../../domain/timing";

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

export function buildStandaloneSvg(
  sourceSvg: SVGSVGElement,
  layouts: ExportTrackLayout[],
  sourceWidth: number,
  height: number,
  labelWidth: number,
  range: ExportRange,
  durationPs: number,
  outputTimelineWidth: number,
): string {
  const safeDuration = Math.max(1, durationPs);
  const startRatio = Math.max(0, Math.min(1, range.startPs / safeDuration));
  const endRatio = Math.max(startRatio, Math.min(1, range.endPs / safeDuration));
  const sourceTimelineWidth = Math.max(1, sourceWidth - CANVAS_GUTTER * 2);
  const sourceStartX = CANVAS_GUTTER + startRatio * sourceTimelineWidth;
  const sourceEndX = CANVAS_GUTTER + endRatio * sourceTimelineWidth;
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
  background.setAttribute("fill", "#ffffff");
  exported.appendChild(background);

  const labelBackground = document.createElementNS(SVG_NAMESPACE, "rect");
  labelBackground.setAttribute("width", String(labelWidth));
  labelBackground.setAttribute("height", String(height));
  labelBackground.setAttribute("fill", "#f8f8fb");
  exported.appendChild(labelBackground);

  const labelDivider = document.createElementNS(SVG_NAMESPACE, "line");
  labelDivider.setAttribute("x1", String(labelWidth));
  labelDivider.setAttribute("x2", String(labelWidth));
  labelDivider.setAttribute("y1", "0");
  labelDivider.setAttribute("y2", String(height));
  labelDivider.setAttribute("stroke", "#dfe1e8");
  exported.appendChild(labelDivider);

  const axisLabel = document.createElementNS(SVG_NAMESPACE, "text");
  axisLabel.setAttribute("x", "13");
  axisLabel.setAttribute("y", "25");
  axisLabel.setAttribute("fill", "#777a88");
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
    divider.setAttribute("stroke", "#e3e4eb");
    exported.appendChild(divider);

    const label = document.createElementNS(SVG_NAMESPACE, "text");
    label.setAttribute("x", "13");
    label.setAttribute("y", String(y + trackHeight / 2 + 4));
    label.setAttribute("fill", "#20212b");
    label.setAttribute("font-size", "11");
    label.setAttribute("font-family", "Inter, Arial, sans-serif");
    label.setAttribute("font-weight", "700");
    label.textContent = signal.name;
    exported.appendChild(label);
  });

  const clonedCanvas = sourceSvg.cloneNode(true) as SVGSVGElement;
  inlineSvgStyles(sourceSvg, clonedCanvas);
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
    .forEach((element) => element.style.setProperty("fill", "#ffffff"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".grid-minor")
    .forEach((element) => element.style.setProperty("stroke", "#f0f1f5"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".grid-major, .row-divider")
    .forEach((element) => element.style.setProperty("stroke", "#dfe1e8"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".axis line")
    .forEach((element) => element.style.setProperty("stroke", "#c8cad3"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".axis text")
    .forEach((element) => element.style.setProperty("fill", "#686a78"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-logic-line, .data-transition-line")
    .forEach((element) => element.style.setProperty("stroke", "#0b8c73"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-high-z-line")
    .forEach((element) => element.style.setProperty("stroke", "#686a78"));
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-state-label")
    .forEach((element) => {
      element.style.setProperty("fill", "#20212b");
      element.style.setProperty("stroke", "#ffffff");
    });
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-symbol-shape")
    .forEach((element) => {
      const tokenColor =
        element.parentElement?.style.getPropertyValue("--token-color");
      if (!tokenColor) return;
      element.style.setProperty("fill", `${tokenColor}22`);
      element.style.setProperty("stroke", tokenColor);
    });
  clonedCanvas
    .querySelectorAll<SVGElement>(".data-symbol-label")
    .forEach((element) => {
      const tokenColor =
        element.parentElement?.style.getPropertyValue("--token-color");
      if (tokenColor) element.style.setProperty("fill", tokenColor);
    });

  exported.appendChild(clonedCanvas);
  return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(exported)}`;
}
