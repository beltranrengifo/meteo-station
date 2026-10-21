// Renders an SVG to PNG with resvg, using the system fonts. From frontend/:
//   deno run -A --no-lock --node-modules-dir=none design/render.ts design/og-image.svg public/og-image.png 1200
import { Resvg } from "npm:@resvg/resvg-js@2.6.2";

const [source, output, width] = Deno.args;
const svg = await Deno.readTextFile(source);
const png = new Resvg(svg, {
  fitTo: { mode: "width", value: Number(width) },
  font: { loadSystemFonts: true, defaultFontFamily: "Arial" },
}).render().asPng();
await Deno.writeFile(output, png);
console.log(`${output}: ${png.length} bytes`);
