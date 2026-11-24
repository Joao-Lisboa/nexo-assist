/**
 * Apaga os bancos locais. Na próxima execução o schema é recriado e os
 * dados de exemplo são semeados de novo, relativos à data atual.
 */
import fs from "node:fs";
import path from "node:path";

const dir = path.resolve(process.cwd(), process.env.DATA_DIR ?? "data");
for (const f of ["app.db", "app.db-wal", "app.db-shm", "tickets.db", "tickets.db-wal", "tickets.db-shm"]) {
  fs.rmSync(path.join(dir, f), { force: true });
}
console.log(`Bancos apagados em ${dir}. Reinicie o servidor (npm run dev) para recriar com os dados de exemplo.`);
