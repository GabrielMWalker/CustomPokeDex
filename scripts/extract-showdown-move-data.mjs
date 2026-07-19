import { createRequire } from "node:module";
import path from "node:path";

const sourcePath = process.argv[2];
if (!sourcePath) throw new Error("Informe o caminho de showdown/data/moves.js");

const require = createRequire(import.meta.url);
const { Moves } = require(path.resolve(sourcePath));
const moveData = Object.fromEntries(Object.entries(Moves || {}).map(([id, move]) => [id, {
  name: String(move.name || id),
  type: String(move.type || "normal").toLowerCase(),
  category: String(move.category || "Status").toLowerCase(),
  power: Math.max(0, Number(move.basePower || 0))
}]));

process.stdout.write(JSON.stringify(moveData));
