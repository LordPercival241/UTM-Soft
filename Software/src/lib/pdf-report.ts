import { jsPDF } from "jspdf";
import type { Sample, TestSetup } from "@/lib/test-domain";
import { UTM_LOGO_BASE64 } from "@/lib/logo-base64";

/**
 * Captura el SVG de Recharts y lo renderiza sobre un canvas con fondo blanco,
 * reemplazando los colores del tema oscuro por colores legibles sobre blanco.
 */
export async function captureChartAsPng(containerElement: HTMLElement): Promise<string | null> {
  const svg = containerElement.querySelector("svg");
  if (!svg) return null;

  try {
    const clonedSvg = svg.cloneNode(true) as SVGElement;
    clonedSvg.setAttribute("xmlns", "http://www.w3.org/2000/svg");

    const width = svg.clientWidth || 700;
    const height = svg.clientHeight || 350;
    clonedSvg.setAttribute("width", String(width));
    clonedSvg.setAttribute("height", String(height));

    // Reemplazar colores del tema oscuro por equivalentes para fondo blanco
    const darkToLight: Record<string, string> = {
      "#2B323B": "#D1D5DB", // Grid lines
      "#2b323b": "#D1D5DB",
      "#8C97A5": "#475569", // Axis labels / ticks
      "#8c97a5": "#475569",
      "#0d1016": "#FFFFFF", // Background
      "#1B2026": "#FFFFFF",
      "#1b2026": "#FFFFFF",
      "#E1E5EA": "#1E293B", // Text
      "#e1e5ea": "#1E293B",
    };

    // Recorrer todos los elementos del SVG clonado y sustituir atributos de color
    const allElements = clonedSvg.querySelectorAll("*");
    allElements.forEach((el) => {
      for (const attr of ["fill", "stroke", "color", "stop-color"]) {
        const val = el.getAttribute(attr);
        if (val && darkToLight[val]) {
          el.setAttribute(attr, darkToLight[val]);
        }
      }
      // Sustituir colores inline en el atributo style
      const style = el.getAttribute("style");
      if (style) {
        let newStyle = style;
        for (const [dark, light] of Object.entries(darkToLight)) {
          newStyle = newStyle.replaceAll(dark, light);
        }
        if (newStyle !== style) el.setAttribute("style", newStyle);
      }
    });

    const svgData = new XMLSerializer().serializeToString(clonedSvg);
    const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(svgBlob);

    return await new Promise<string | null>((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const scale = 2;
        canvas.width = width * scale;
        canvas.height = height * scale;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          resolve(null);
          return;
        }
        // Fondo blanco para el reporte impreso
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL("image/png"));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(null);
      };
      img.src = url;
    });
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Utilidad: texto recortado que no excede maxWidth, con elipsis si es necesario
// ---------------------------------------------------------------------------
function clippedText(
  doc: jsPDF,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  options?: { align?: "left" | "center" | "right" }
) {
  let t = text;
  while (doc.getTextWidth(t) > maxWidth && t.length > 1) {
    t = t.slice(0, -1);
  }
  if (t.length < text.length) t = t.slice(0, -1) + "...";
  doc.text(t, x, y, options);
}

// ---------------------------------------------------------------------------
// Generador principal del reporte PDF formal
// ---------------------------------------------------------------------------
export function generateTestPdf(
  setup: TestSetup,
  samples: Sample[],
  droppedSamples: number,
  operatorName: string,
  chartPngDataUrl: string | null
): void {
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4"
  });

  const pageWidth = doc.internal.pageSize.getWidth();   // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight();  // 297 mm
  const margin = 16;
  const contentWidth = pageWidth - margin * 2;           // 178 mm

  // ======================================================================
  // CÁLCULOS ESTADÍSTICOS
  // ======================================================================
  let maxForce = 0;
  let maxStress = 0;
  let strainAtMaxStress = 0;
  let maxStrain = 0;
  let maxDisplacement = 0;

  for (const s of samples) {
    if (s.forceN > maxForce) maxForce = s.forceN;
    if (s.stressMpa > maxStress) {
      maxStress = s.stressMpa;
      strainAtMaxStress = s.strain;
    }
    if (s.strain > maxStrain) maxStrain = s.strain;
    if (s.displacementMm > maxDisplacement) maxDisplacement = s.displacementMm;
  }

  // Estimacion del Modulo de Elasticidad (Young) en zona lineal inicial
  let elasticModulusMpa = 0;
  let youngP1Idx = -1;
  let youngP2Idx = -1;
  if (samples.length >= 6) {
    const maxIdx = samples.findIndex((s) => s.stressMpa === maxStress);
    const subIdx = maxIdx > 5 ? maxIdx : samples.length;
    youngP1Idx = Math.max(1, Math.floor(subIdx * 0.15));
    youngP2Idx = Math.max(2, Math.floor(subIdx * 0.45));
    const p1 = samples[youngP1Idx];
    const p2 = samples[youngP2Idx];
    if (p1 && p2 && p2.strain > p1.strain) {
      const dStrain = p2.strain - p1.strain;
      const dStress = p2.stressMpa - p1.stressMpa;
      if (dStrain > 0.0002 && dStress > 0) {
        elasticModulusMpa = dStress / dStrain;
      }
    }
  }

  // ======================================================================
  // ENCABEZADO INSTITUCIONAL
  // ======================================================================
  doc.setFillColor(8, 18, 29);
  doc.rect(0, 0, pageWidth, 28, "F");

  try {
    doc.addImage(UTM_LOGO_BASE64, "PNG", margin, 4, 20, 20);
  } catch {
    // Si falla la insercion del logo, continuar sin bloquear el reporte
  }

  const textStartX = margin + 24;

  doc.setTextColor(125, 211, 252);
  doc.setFontSize(12);
  doc.setFont("helvetica", "bold");
  doc.text("UTMachine LAB", textStartX, 10);

  doc.setFontSize(8.5);
  doc.setTextColor(200, 220, 235);
  doc.setFont("helvetica", "normal");
  doc.text("REPORTE DE ENSAYO DE TRACCION", textStartX, 15.5);

  doc.setFontSize(7.5);
  doc.setTextColor(125, 211, 252);
  doc.text("Normativa: ASTM D638 / ISO 527", textStartX, 21);

  const now = new Date();
  const dateStr = now.toLocaleDateString("es-ES", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
  doc.setFontSize(7.5);
  doc.setTextColor(200, 220, 235);
  doc.text(`Fecha: ${dateStr}`, pageWidth - margin, 10, { align: "right" });
  doc.text("Maquina Universal de Ensayos Low-Cost", pageWidth - margin, 15.5, { align: "right" });
  doc.text("FC-UNI  Instrumentacion Trazable", pageWidth - margin, 21, { align: "right" });

  let y = 34;

  // ======================================================================
  // SECCION 1: INFORMACION DE LA PROBETA Y CONFIGURACION
  // ======================================================================
  doc.setFillColor(240, 244, 248);
  doc.rect(margin, y, contentWidth, 7, "F");
  doc.setTextColor(14, 116, 144);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("1. INFORMACION DE LA PROBETA Y CONFIGURACION", margin + 3, y + 5);
  y += 10;

  doc.setFontSize(8.5);
  doc.setTextColor(30, 41, 59);

  const labelW = 42;    // Ancho reservado para la etiqueta
  const col1X = margin + 3;
  const col1ValX = col1X + labelW;
  const col2X = margin + contentWidth / 2 + 2;
  const col2ValX = col2X + labelW;
  const valMaxW1 = contentWidth / 2 - labelW - 6;
  const valMaxW2 = contentWidth / 2 - labelW - 6;

  const infoRows: Array<[string, string, string, string]> = [
    ["ID de Probeta:", setup.specimenId, "Operador:", operatorName || "No especificado"],
    ["Material:", setup.material, "Perfil Calibracion:", setup.calibrationProfileId],
    ["Longitud Inicial (L0):", `${setup.gaugeLengthMm} mm`, "Muestras Adquiridas:", `${samples.length} puntos`],
    ["Area Inicial (A0):", `${setup.areaMm2} mm2`, "Muestras Perdidas:", `${droppedSamples}`],
  ];

  for (const [l1, v1, l2, v2] of infoRows) {
    doc.setFont("helvetica", "normal");
    doc.text(l1, col1X, y);
    doc.setFont("helvetica", "bold");
    clippedText(doc, v1, col1ValX, y, valMaxW1);

    doc.setFont("helvetica", "normal");
    doc.text(l2, col2X, y);
    doc.setFont("helvetica", "bold");
    clippedText(doc, v2, col2ValX, y, valMaxW2);

    y += 5.5;
  }

  y += 4;

  // ======================================================================
  // SECCION 2: PROPIEDADES MECANICAS CALCULADAS
  // ======================================================================
  doc.setFillColor(240, 244, 248);
  doc.rect(margin, y, contentWidth, 7, "F");
  doc.setTextColor(14, 116, 144);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("2. PROPIEDADES MECANICAS CALCULADAS", margin + 3, y + 5);
  y += 10;

  // --- Tarjetas de resultados (3 columnas para evitar desbordamiento) ---
  const cardGap = 3;
  const cardW = (contentWidth - cardGap * 2) / 3;
  const cardH = 20;

  const cards: Array<{ label: string; value: string; unit: string; accent?: boolean }> = [
    { label: "Fuerza Maxima (Fmax)", value: maxForce.toFixed(2), unit: "N" },
    { label: "Esfuerzo Maximo (Sigma max)", value: maxStress.toFixed(3), unit: "MPa", accent: true },
    { label: "Deformacion Maxima (Epsilon max)", value: (maxStrain * 100).toFixed(2), unit: "%" },
  ];

  cards.forEach((card, i) => {
    const cx = margin + i * (cardW + cardGap);
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(cx, y, cardW, cardH, 1.5, 1.5, "FD");

    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    clippedText(doc, card.label, cx + 3, y + 5.5, cardW - 6);

    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(card.accent ? 14 : 15, card.accent ? 116 : 23, card.accent ? 144 : 42);
    clippedText(doc, `${card.value} ${card.unit}`, cx + 3, y + 14.5, cardW - 6);
  });

  y += cardH + 4;

  // --- Recuadro destacado del Modulo de Young ---
  doc.setFillColor(239, 246, 255);         // Azul claro suave
  doc.setDrawColor(59, 130, 246);          // Borde azul
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, y, contentWidth, 22, 1.5, 1.5, "FD");
  doc.setLineWidth(0.2);

  doc.setFontSize(8);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(30, 64, 175);
  doc.text("MODULO DE ELASTICIDAD DE YOUNG (E)", margin + 4, y + 5.5);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(71, 85, 105);
  doc.text("E = Delta Sigma / Delta Epsilon   [MPa]", margin + 4, y + 10.5);
  doc.text("Calculado en la region lineal elastica de la curva esfuerzo-deformacion.", margin + 4, y + 15);

  // Valor numerico a la derecha
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  if (elasticModulusMpa > 0) {
    doc.setTextColor(30, 64, 175);
    doc.text(`${elasticModulusMpa.toFixed(1)} MPa`, pageWidth - margin - 4, y + 13, { align: "right" });
  } else {
    doc.setTextColor(100, 116, 139);
    doc.text("No determinado", pageWidth - margin - 4, y + 13, { align: "right" });
  }

  // Rango de calculo
  if (elasticModulusMpa > 0 && youngP1Idx >= 0 && youngP2Idx >= 0) {
    doc.setFontSize(6.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Rango de regresion: puntos ${youngP1Idx} a ${youngP2Idx} (15% a 45% de la zona pre-fluencia)`,
      margin + 4,
      y + 19
    );
  }

  y += 26;

  // ======================================================================
  // SECCION 3: CURVA ESFUERZO-DEFORMACION
  // ======================================================================
  doc.setFillColor(240, 244, 248);
  doc.rect(margin, y, contentWidth, 7, "F");
  doc.setTextColor(14, 116, 144);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("3. CURVA ESFUERZO - DEFORMACION EXPERIMENTAL", margin + 3, y + 5);
  y += 9;

  if (chartPngDataUrl) {
    const chartHeight = 78;
    // Borde antes de la imagen para contener visualmente
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, chartHeight, "S");
    doc.addImage(chartPngDataUrl, "PNG", margin + 0.5, y + 0.5, contentWidth - 1, chartHeight - 1);
    y += chartHeight + 3;
  } else {
    doc.setDrawColor(203, 213, 225);
    doc.rect(margin, y, contentWidth, 36, "S");
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100, 116, 139);
    doc.text("No se pudo incrustar la imagen de la curva.", margin + 10, y + 18);
    y += 40;
  }

  // ======================================================================
  // SECCION 4: TABLA DE MUESTREO REPRESENTATIVO
  // ======================================================================

  // Verificar si queda espacio suficiente; si no, agregar pagina
  const tableNeeded = 12 + 8 * 4.5 + 20; // header + 8 rows + footer
  if (y + tableNeeded > pageHeight - 15) {
    doc.addPage();
    y = 16;
  }

  doc.setFillColor(240, 244, 248);
  doc.rect(margin, y, contentWidth, 7, "F");
  doc.setTextColor(14, 116, 144);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("4. MUESTREO REPRESENTATIVO DEL ENSAYO", margin + 3, y + 5);
  y += 10;

  // Columnas de la tabla con posiciones calculadas para no desbordarse
  const tCols = [
    { label: "Punto",          x: margin + 2,   w: 18 },
    { label: "Tiempo (ms)",    x: margin + 22,  w: 26 },
    { label: "Fuerza (N)",     x: margin + 50,  w: 26 },
    { label: "Desplaz. (mm)",  x: margin + 78,  w: 28 },
    { label: "Esfuerzo (MPa)", x: margin + 108, w: 30 },
    { label: "Deform. (%)",    x: margin + 140, w: 36 },
  ];

  // Encabezados de tabla
  doc.setFontSize(7.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(71, 85, 105);
  tCols.forEach((col) => clippedText(doc, col.label, col.x, y, col.w));

  y += 2;
  doc.setDrawColor(203, 213, 225);
  doc.line(margin, y, margin + contentWidth, y);
  y += 4;

  // Filas de datos (hasta 8 puntos distribuidos uniformemente)
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(30, 41, 59);

  const step = Math.max(1, Math.floor(samples.length / 8));
  const sampleSubset = samples
    .filter((_, idx) => idx % step === 0 || idx === samples.length - 1)
    .slice(0, 8);

  for (const s of sampleSubset) {
    clippedText(doc, String(s.sequence),                tCols[0].x, y, tCols[0].w);
    clippedText(doc, String(s.deviceTimeMs),            tCols[1].x, y, tCols[1].w);
    clippedText(doc, s.forceN.toFixed(2),               tCols[2].x, y, tCols[2].w);
    clippedText(doc, s.displacementMm.toFixed(3),       tCols[3].x, y, tCols[3].w);
    clippedText(doc, s.stressMpa.toFixed(3),            tCols[4].x, y, tCols[4].w);
    clippedText(doc, (s.strain * 100).toFixed(2) + " %", tCols[5].x, y, tCols[5].w);
    y += 4.5;
  }

  // ======================================================================
  // PIE DE PAGINA
  // ======================================================================
  const footerY = pageHeight - 12;
  doc.setDrawColor(226, 232, 240);
  doc.line(margin, footerY, margin + contentWidth, footerY);

  doc.setFontSize(7);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(100, 116, 139);
  doc.text(
    "Documento tecnico de certificacion experimental generado por UTMachine Lab (FC-UNI). Registro trazable.",
    margin,
    footerY + 4
  );
  doc.text(
    `Pagina ${doc.getCurrentPageInfo().pageNumber} de ${doc.getNumberOfPages()}  -  Certificado Metrologico Digital`,
    pageWidth - margin,
    footerY + 4,
    { align: "right" }
  );

  // Guardar archivo
  const safeId = setup.specimenId.replace(/[^a-zA-Z0-9_-]/g, "_") || "sin_id";
  doc.save(`reporte-ensayo-${safeId}.pdf`);
}
