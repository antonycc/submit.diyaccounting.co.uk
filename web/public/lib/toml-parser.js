// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// Minimal TOML parser for submit.catalogue.toml
// Supports: key = value, [section], [[array-of-tables]], strings, numbers, arrays of strings
(function () {
  const TOML = {
    parse: function (src) {
      const res = {};
      let currentSection = res;
      const lines = src.split(/\r?\n/);

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith("#")) continue;

        if (line.startsWith("[[")) {
          const sectionName = line.substring(2, line.lastIndexOf("]]")).trim();
          if (!res[sectionName]) res[sectionName] = [];
          const newEntry = {};
          res[sectionName].push(newEntry);
          currentSection = newEntry;
        } else if (line.startsWith("[")) {
          const sectionName = line.substring(1, line.lastIndexOf("]")).trim();
          res[sectionName] = {};
          currentSection = res[sectionName];
        } else if (line.indexOf("=") !== -1) {
          const eqIdx = line.indexOf("=");
          const key = line.substring(0, eqIdx).trim();
          const value = line.substring(eqIdx + 1).trim();

          currentSection[key] = parseValue(value);
        }
      }
      return res;
    },
  };

  function parseValue(val) {
    val = val.trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      return val.substring(1, val.length - 1);
    }
    if (val.startsWith("[") && val.endsWith("]")) {
      const inner = val.substring(1, val.length - 1).trim();
      if (!inner) return [];
      return inner.split(",").map((v) => parseValue(v.trim()));
    }
    if (val === "true") return true;
    if (val === "false") return false;
    if (!isNaN(val) && val !== "") return Number(val);
    return val;
  }

  window.TOML = TOML;
})();
