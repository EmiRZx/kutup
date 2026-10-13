import initSqlJs, { type SqlJsStatic } from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

let loading: Promise<SqlJsStatic> | undefined;

/** Loads SQLite (compiled to WebAssembly) once per page. */
export function loadSqlJs(): Promise<SqlJsStatic> {
  loading ??= initSqlJs({ locateFile: () => wasmUrl });
  return loading;
}
