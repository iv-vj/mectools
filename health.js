/* 机械工具箱 · 在线数据体检（纯浏览器，文件不出本机）
 * 没有网络请求、没有上传、没有后端。所有解析都在这个页面里完成。
 * 依赖：只有浏览器自带的 DecompressionStream / DOMParser / TextDecoder。
 */
(function (global) {
  'use strict';

  // ─────────────────────────── 小工具
  // 只匹配夹在两个汉字之间的空格，用前后瞻把汉字本身排除在匹配之外 ——
  // 若写成 /([\u4e00-\u9fff]) +(?=...)/ 再 replace(..., '')，那个捕获组里的汉字会被一起删掉
  // （实测 '数 量' 会变成 '量'）。
  const CJK_SPACE = /(?<=[\u4e00-\u9fff]) +(?=[\u4e00-\u9fff])/g;
  const WS = /[\s\u3000\u00a0]+/g;
  const FULLWIDTH = /[\uff01-\uff5e]/g;
  const CURRENCY = /[¥￥$€£]/g;
  const NULLS = new Set(['', '-', '--', '—', '–', '/', '\\', 'n/a', 'na', 'nan', 'null',
    'none', 'nil', '无', '空', '暂无', '未填', '未知', '#n/a', '#value!', '#div/0!',
    '#ref!', '#name?', '#null!', '.']);

  function toHalf(s) {
    return String(s).replace(FULLWIDTH, c => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  }
  function normCol(name) {
    let s = String(name == null ? '' : name);
    s = s.replace(/^\ufeff/, '');
    s = toHalf(s).replace(WS, ' ').trim();
    s = s.replace(CJK_SPACE, '');
    return s;
  }
  function cleanText(v) {
    if (v == null) return '';
    let s = String(v).replace(/^\ufeff/, '');
    s = toHalf(s).replace(/\r\n?/g, ' ').replace(/[\u00a0\u3000]/g, ' ');
    try { s = s.normalize('NFKC'); } catch (e) { /* 老浏览器 */ }
    return s.replace(WS, ' ').trim();
  }
  function isBlank(v) {
    if (v == null) return true;
    const s = cleanText(v).toLowerCase();
    return NULLS.has(s);
  }

  const NUM_RE = /^[-+]?[0-9][0-9,\s]*(\.[0-9]+)?([eE][-+]?\d+)?$/;
  function parseNum(v) {
    if (v == null) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = cleanText(v);
    if (!s || NULLS.has(s.toLowerCase())) return null;
    let pct = false;
    s = s.replace(CURRENCY, '').trim();
    if (s.endsWith('%')) { pct = true; s = s.slice(0, -1).trim(); }
    // 中文单位
    let mult = 1;
    const um = s.match(/(万|亿|千|k|K|w|W)$/);
    if (um) {
      mult = { '万': 1e4, 'w': 1e4, 'W': 1e4, '亿': 1e8, '千': 1e3, 'k': 1e3, 'K': 1e3 }[um[1]];
      s = s.slice(0, -um[1].length).trim();
    }
    // 尾部单位（件、个、元…）
    s = s.replace(/[\u4e00-\u9fffA-Za-z]+$/u, '').trim();
    s = s.replace(/,/g, '').replace(/\s/g, '');
    if (!NUM_RE.test(s)) return null;
    let n = parseFloat(s);
    if (!isFinite(n)) return null;
    n *= mult;
    if (pct) n /= 100;
    return n;
  }

  const DATE_PATTERNS = [
    [/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/, 'ymd'],
    [/^(\d{1,2})[-/.月](\d{1,2})[-/.日]$/, 'md'],
    [/^(\d{4})(\d{2})(\d{2})$/, 'ymd8']
  ];
  function parseDate(v) {
    if (v == null) return null;
    if (v instanceof Date) return v;
    let s = cleanText(v);
    if (!s) return null;
    for (const [re, kind] of DATE_PATTERNS) {
      const m = s.match(re);
      if (m) {
        let y, mo, d;
        if (kind === 'ymd8') { y = +m[1]; mo = +m[2]; d = +m[3]; }
        else if (kind === 'ymd') { y = +m[1]; mo = +m[2]; d = +m[3]; }
        else { y = new Date().getFullYear(); mo = +m[1]; d = +m[2]; }
        if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) return new Date(y, mo - 1, d);
        return null;
      }
    }
    // Excel 序列号
    if (/^\d{5}$/.test(s)) {
      const n = +s;
      if (n >= 20000 && n <= 80000) return new Date(Date.UTC(1899, 11, 30) + n * 86400000);
    }
    return null;
  }
  function dateStyle(s) {
    s = cleanText(s);
    if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}$/.test(s)) return s.replace(/\d/g, '0').replace(/^0{4}/, '年');
    if (/^\d{4}年/.test(s)) return '年月日';
    if (/^\d{8}$/.test(s)) return '8位数字';
    if (/^\d{5}$/.test(s)) return 'Excel序列号';
    return '其它';
  }

  // ─────────────────────────── CSV
  const ENCODINGS = ['utf-8', 'gb18030', 'big5'];
  function decodeBytes(buf, forced) {
    const list = forced ? [forced] : ENCODINGS;
    for (const enc of list) {
      try {
        const s = new TextDecoder(enc, { fatal: true }).decode(buf);
        if (/\ufffd/.test(s)) continue;
        return { text: s.replace(/^\ufeff/, ''), enc };
      } catch (e) { /* 换下一个 */ }
    }
    return { text: new TextDecoder('utf-8').decode(buf).replace(/^\ufeff/, ''), enc: 'utf-8(可能乱码)' };
  }
  function sniffDelim(text) {
    const head = text.split(/\r?\n/).slice(0, 12).join('\n');
    const cand = [',', '\t', ';', '|'];
    let best = ',', bestN = -1;
    for (const d of cand) {
      const counts = head.split(/\r?\n/).map(l => l.split(d).length);
      const m = counts.length ? Math.max(...counts) : 0;
      const consistent = counts.filter(c => c === m).length;
      const score = m > 1 ? m * 10 + consistent : 0;
      if (score > bestN) { bestN = score; best = d; }
    }
    return bestN > 0 ? best : ',';
  }
  function splitCsvLine(line, d) {
    const out = []; let cur = ''; let q = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (q) {
        if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === d) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }
  function readCsv(buf) {
    const { text, enc } = decodeBytes(buf);
    const d = sniffDelim(text);
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
    const rows = lines.map(l => splitCsvLine(l, d));
    return { sheets: [{ name: '数据', rows }], enc, delim: d, inline: true };
  }

  // ─────────────────────────── XLSX（自己解 zip）
  async function inflateRaw(u8) {
    const ds = new DecompressionStream('deflate-raw');
    const st = new Blob([u8]).stream().pipeThrough(ds);
    return new Uint8Array(await new Response(st).arrayBuffer());
  }
  function zipEntries(buf) {
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 66000); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('不是有效的 xlsx（找不到 zip 结尾）');
    const n = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const out = {};
    for (let k = 0; k < n; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
      const lho = dv.getUint32(p + 42, true);
      const name = new TextDecoder('utf-8').decode(u8.subarray(p + 46, p + 46 + nl));
      out[name] = { method, csize, lho };
      p += 46 + nl + el + cl;
    }
    return out;
  }
  async function zipRead(buf, ent) {
    if (!ent) return null;
    const dv = new DataView(buf), u8 = new Uint8Array(buf);
    const nl = dv.getUint16(ent.lho + 26, true), el = dv.getUint16(ent.lho + 28, true);
    const start = ent.lho + 30 + nl + el;
    const raw = u8.subarray(start, start + ent.csize);
    if (ent.method === 0) return raw;
    if (ent.method === 8) return await inflateRaw(raw);
    throw new Error('xlsx 里出现了不支持的压缩方式 ' + ent.method);
  }
  function colIndex(ref) {
    const m = String(ref || '').match(/^([A-Z]+)/);
    if (!m) return 0;
    let n = 0;
    for (const ch of m[1]) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }
  async function readXlsx(buf, fname, collected) {
    const es = zipEntries(buf);
    const dec = new TextDecoder('utf-8');
    let shared = [];
    if (es['xl/sharedStrings.xml']) {
      const sst = new DOMParser().parseFromString(dec.decode(await zipRead(buf, es['xl/sharedStrings.xml'])), 'application/xml');
      shared = [...sst.getElementsByTagName('si')].map(si =>
        [...si.getElementsByTagName('t')].map(t => t.textContent).join(''));
    }
    // 表名 + rId
    const wdoc = new DOMParser().parseFromString(dec.decode(await zipRead(buf, es['xl/workbook.xml'])), 'application/xml');
    const sheetEls = [...wdoc.getElementsByTagName('sheet')];
    // rels: rId -> target
    const relMap = {};
    if (es['xl/_rels/workbook.xml.rels']) {
      const rdoc = new DOMParser().parseFromString(dec.decode(await zipRead(buf, es['xl/_rels/workbook.xml.rels'])), 'application/xml');
      [...rdoc.getElementsByTagName('Relationship')].forEach(r => {
        relMap[r.getAttribute('Id')] = r.getAttribute('Target');
      });
    }
    const order = Object.keys(es).filter(k => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort();
    const sheets = [];
    for (let i = 0; i < sheetEls.length; i++) {
      const el = sheetEls[i];
      let path = null;
      const rid = el.getAttribute('r:id') || el.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
      if (rid && relMap[rid]) {
        let t = relMap[rid];
        path = t.startsWith('/') ? t.slice(1) : ('xl/' + t.replace(/^\.\.\//, ''));
      }
      if (!path || !es[path]) path = order[i] || order[0];
      if (!es[path]) continue;
      const doc = new DOMParser().parseFromString(dec.decode(await zipRead(buf, es[path])), 'application/xml');
      const rows = [];
      let merged = 0;
      const mc = doc.getElementsByTagName('mergeCell');
      merged = mc ? mc.length : 0;
      const MAXCOL = 300, MAXROW = 20000;
      let truncated = 0;
      for (const r of doc.getElementsByTagName('row')) {
        if (rows.length >= MAXROW) { truncated++; continue; }
        const arr = [];
        let touched = false;
        for (const c of r.getElementsByTagName('c')) {
          const idx = colIndex(c.getAttribute('r'));
          if (idx >= MAXCOL) continue;   // 防 Excel 里那种 XFD 级的空引用把数组撑爆
          const t = c.getAttribute('t');
          let val = '';
          if (t === 'inlineStr') {
            const is = c.getElementsByTagName('is')[0];
            val = is ? [...is.getElementsByTagName('t')].map(x => x.textContent).join('') : '';
          } else if (t === 's') {
            const v = c.getElementsByTagName('v')[0];
            val = v ? (shared[+v.textContent] || '') : '';
          } else {
            const v = c.getElementsByTagName('v')[0];
            val = v ? v.textContent : '';
            if (t === 'b') val = val === '1' ? 'TRUE' : 'FALSE';
          }
          while (arr.length < idx) arr.push('');
          arr[idx] = val;
          if (val !== '') touched = true;
        }
        if (touched) rows.push(arr);
      }
      sheets.push({ name: el.getAttribute('name') || ('Sheet' + (i + 1)), rows, merged, truncated });
    }
    if (!sheets.length) throw new Error('这个 xlsx 里没有找到工作表');
    return { sheets, enc: 'zip/xml', inline: false };
  }

  // ─────────────────────────── 列画像
  function profileColumn(vals) {
    const n = vals.length;
    let blank = 0;
    const issues = [];
    const nonBlank = [];
    for (const v of vals) { if (isBlank(v)) blank++; else nonBlank.push(v); }
    const blankRate = n ? blank / n : 0;

    // 类型判定（在非空值上做）
    const m = nonBlank.length || 1;
    let numHit = 0, dateHit = 0, boolHit = 0;
    const styles = {};
    for (const v of nonBlank) {
      if (parseNum(v) != null) numHit++;
      const d = parseDate(v);
      if (d) { dateHit++; const st = dateStyle(v); styles[st] = (styles[st] || 0) + 1; }
      const s = cleanText(v).toLowerCase();
      if (['是', '否', 'y', 'n', 'yes', 'no', 'true', 'false', '√', '×', '有', '無', '无', 'on', 'off'].includes(s)) boolHit++;
    }
    let kind = '文本';
    if (dateHit / m >= 0.8 && dateHit > 0) kind = '日期';
    else if (numHit / m >= 0.8 && numHit > 0) kind = '数值';
    else if (boolHit / m >= 0.8 && boolHit > 0) kind = '是否';

    // 明显是数值但存成了文本。
    // 这里必须同时满足两件事才报：
    //   ① 列的类型不是「数值」（数值列本来就该是数字，不算问题）；
    //   ② 值上真的有"文字装饰" —— 货币符号 / 千分位逗号 / 全角数字 / 前后空白 / 粘着中文单位。
    // 只判 ① 是不够的：Excel 日期本质是「数字序列号 + 日期格式」，读出来也是纯数字串，
    // 早先就是这么把一整列日期误报成「数字被存成了文本，共 8/8 个」的。
    const decoMoney = v => /[¥￥$€£]/.test(String(v));
    const decoComma = v => /[0-9],[0-9]{3}/.test(String(v));
    const decoWide = v => /[\uff01-\uff5e]/.test(String(v));
    const decoPad = v => /^[\s\u3000\u00a0]|[\s\u3000\u00a0]$/.test(String(v));
    const decoUnit = v => /[\u4e00-\u9fff]\s*$/.test(cleanText(v));
    const decorated = nonBlank.filter(v =>
      decoMoney(v) || decoComma(v) || decoWide(v) || decoPad(v) || decoUnit(v)).length;
    if (kind === '文本' && numHit / m >= 0.5 && numHit > 0 &&
        decorated / Math.max(nonBlank.length, 1) >= 0.5) {
      let why = '数字被存成了文本';
      if (nonBlank.filter(decoMoney).length) why += '（带货币符号 ¥/$）';
      else if (nonBlank.filter(decoComma).length) why += '（带千分位逗号）';
      else if (nonBlank.filter(decoUnit).length) why += '（尾巴上粘着单位）';
      issues.push(why + `，共 ${numHit}/${nonBlank.length} 个`);
    }
    // 日期写法不统一
    if (kind === '日期' && Object.keys(styles).length > 1) {
      const parts = Object.entries(styles).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}×${v}`);
      issues.push('日期写法不统一：' + parts.join(' / '));
    }
    // 前后空白 / 全角空格
    const padded = nonBlank.filter(v => typeof v === 'string' && /^\s|\s$|[\u3000\u00a0]/.test(v)).length;
    if (padded) issues.push(`有 ${padded} 个值前后带空白或全角空格`);

    const uniq = new Set(nonBlank.map(v => cleanText(v))).size;
    if (nonBlank.length >= 5 && uniq === 1) issues.push('整列只有 1 个值（是不是填错了？）');
    if (nonBlank.length >= 8 && uniq === nonBlank.length) issues.push('取值全不重复（像主键/编号，通常不该拿来做汇总）');
    if (blankRate >= 0.4 && n >= 4) issues.push(`空值偏多（${Math.round(blankRate * 100)}%）`);

    return { n, blank, blankRate, kind, uniq, issues, nonBlank: nonBlank.length, samples: nonBlank.slice(0, 3) };
  }

  function gridInfo(rows) {
    let cols = 0;
    for (const r of rows) cols = Math.max(cols, r.length);
    return { rows: rows.length, cols };
  }

  function normHeader(r) {
    const h = (r || []).map((x, i) => {
      const s = normCol(x);
      return s || ('未命名列' + (i + 1));
    });
    // 重名
    const seen = {};
    return h.map(s => {
      if (seen[s] == null) { seen[s] = 0; return s; }
      seen[s]++; return s + '_' + seen[s];
    });
  }

  // ─────────────────────────── 主流程
  async function inspect(files) {
    const out = { files: [], sheets: [], problems: [], totalRows: 0, totalCols: 0, blanks: 0, cells: 0 };
    for (const f of files) {
      const rec = { name: f.name, size: f.size, ok: true, note: '', sheets: [] };
      let parsed = null;
      try {
        const buf = await f.arrayBuffer();
        if (/\.xlsx$/i.test(f.name)) {
          if (buf.byteLength > 40 * 1024 * 1024) throw new Error('文件超过 40 MB，浏览器里处理会卡');
          parsed = await readXlsx(buf, f.name, out);
        } else {
          if (buf.byteLength > 40 * 1024 * 1024) throw new Error('文件超过 40 MB，浏览器里处理会卡');
          parsed = readCsv(buf);
        }
      } catch (e) {
        rec.ok = false;
        rec.note = e.message || String(e);
        out.files.push(rec);
        out.problems.push({ level: 'file', file: f.name, text: '打不开：' + rec.note });
        continue;
      }
      if (parsed.enc && parsed.enc.indexOf('gb') === 0) {
        rec.note = '编码是 ' + parsed.enc + '，不是 UTF-8';
        out.problems.push({ level: 'file', file: f.name, text: `不是 UTF-8（识别为 ${parsed.enc}）。用 Excel 直接双击打开可能乱码，我需要转一下码。` });
      }
      if (parsed.sheets.length > 1) {
        out.problems.push({ level: 'file', file: f.name, text: `含 ${parsed.sheets.length} 张工作表，得先确认哪张才是数据（别把备注页也当成数据一起合并）` });
      }
      for (const sh of parsed.sheets) {
        const gi = gridInfo(sh.rows);
        const head = normHeader(sh.rows[0] || []);
        const body = sh.rows.slice(1);
        const cols = head.map((name, i) => {
          const vals = body.map(r => (r && r[i] != null ? r[i] : ''));
          return { name, ...profileColumn(vals) };
        });
        let blanks = 0;
        cols.forEach(c => { blanks += c.blank; });
        out.totalRows += body.length; out.totalCols += head.length;
        out.blanks += blanks; out.cells += body.length * head.length;
        const emptyCols = cols.filter(c => c.nonBlank === 0).map(c => c.name);
        if (emptyCols.length) out.problems.push({ level: 'sheet', file: f.name, sheet: sh.name, text: `整列为空：${emptyCols.join('、')}` });
        if (sh.truncated) out.problems.push({ level: 'sheet', file: f.name, sheet: sh.name, text: `这张表超过 20000 行，浏览器里只看了前 20000 行（结论对整表仍然成立，但尾部若还有别的花样我看不到）` });
        if (sh.merged) out.problems.push({ level: 'sheet', file: f.name, sheet: sh.name, text: `有 ${sh.merged} 处合并单元格（合并单元格会让"表头在第几行"变得难判断，建议先拆开）` });
        out.sheets.push({
          file: f.name, sheet: sh.name, rows: body.length, cols: head.length,
          columns: cols, isCsv: !!parsed.inline, delim: parsed.delim
        });
        rec.sheets.push({ name: sh.name, rows: body.length, cols: head.length });
      }
      out.files.push(rec);
    }
    // 跨表：列名相同的 / 可合并的
    out.sameHead = [];
    for (let i = 0; i < out.sheets.length; i++) {
      for (let j = i + 1; j < out.sheets.length; j++) {
        const a = out.sheets[i], b = out.sheets[j];
        if (a.cols !== b.cols) continue;
        const ha = a.columns.map(c => c.name).join('\u0001');
        const hb = b.columns.map(c => c.name).join('\u0001');
        if (ha === hb) out.sameHead.push([a, b]);
      }
    }
    out.mergeHints = [];
    for (const [a, b] of out.sameHead) {
      const common = a.columns.map(c => c.name);
      const keys = common.filter(n => /编号|序号|料号|型号|订单|产品|品名|名称|规格|物料|工号|单号|sku|code|name|id|no/i.test(n)).slice(0, 2);
      out.mergeHints.push({ a, b, common, keys });
    }
    return out;
  }

  // ─────────────────────────── 渲染
  function mdEsc(s) { return String(s == null ? '' : s); }
  function buildMarkdown(r) {
    const L = [];
    const now = new Date();
    const pad = n => String(n).padStart(2, '0');
    L.push('# 数据体检报告');
    L.push('');
    L.push(`生成时间：${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}　·　本报告在你的浏览器里生成，文件没有上传到任何地方`);
    L.push('');
    const blankPct = r.cells ? (r.blanks / r.cells * 100) : 0;
    L.push(`文件 ${r.files.length} 个 ｜ 工作表 ${r.sheets.length} 张 ｜ ${r.totalRows} 行 × ${r.totalCols} 列`);
    L.push(`空单元格占比 ${blankPct.toFixed(1)}%`);
    L.push('');
    L.push('## 【明确的文件层问题】');
    const fp = r.problems.filter(p => p.level === 'file');
    if (fp.length) fp.forEach((p, i) => L.push(`${i + 1}. ${p.file} — ${p.text}`));
    else L.push('没有打不开、编码错、多工作表这类问题。');
    L.push('');
    L.push('## 【逐列体检（只列有情况的列）】');
    let any = false;
    for (const sh of r.sheets) {
      const bad = sh.columns.filter(c => c.issues.length);
      if (!bad.length) continue;
      any = true;
      L.push('');
      L.push(`### ${sh.file} / ${sh.sheet}`);
      for (const c of bad) L.push(`- **${mdEsc(c.name)}**（${c.kind}，非空 ${c.nonBlank}／${c.n}）— ${c.issues.join('；')}`);
    }
    if (!any) L.push('逐列看下来没有需要人工处理的列。');
    L.push('');
    L.push('## 【能不能拼起来】');
    if (r.mergeHints.length) {
      for (const h of r.mergeHints) L.push(`- ${h.a.file} / ${h.a.sheet}  ↔  ${h.b.file} / ${h.b.sheet}：公共列 ${h.common.length} 个${h.keys.length ? `，建议按「${h.keys.join('、')}」关联` : ''}，**可以合并**`);
    } else if (r.sheets.length > 1) {
      L.push('没找到表头完全一致的两张表 —— 要么本来就不该拼，要么表头需要先规整。');
    } else {
      L.push('只有一个工作表，不涉及合并。');
    }
    L.push('');
    L.push('## 【需要人工确认的地方】');
    const human = [];
    r.sheets.forEach(sh => sh.columns.forEach(c => c.issues.forEach(x => human.push(`- ${sh.file} / ${sh.sheet} / ${mdEsc(c.name)}：${x}`))));
    if (human.length) human.forEach(x => L.push(x));
    else L.push('没有。');
    L.push('');
    L.push('## 【结论】');
    const rp = r.problems.length + human.length;
    L.push(`一共发现 ${rp} 处需要处理的地方，其中文件层的 ${r.problems.length} 处、列内容层的 ${human.length} 处。`);
    L.push('');
    // 手工 vs 脚本的粗估。故意用"每次重来一遍"的口径 —— 一次性整理完就完事的数据，
    // 脚本本来就不划算，这也写在下面那句里。
    const manualMin = Math.round(r.totalRows * 0.15 + rp * 6);
    const fmtMin = m => m >= 60 ? `${(m / 60).toFixed(1)} 小时` : `${m} 分钟`;
    L.push(`**手工做一次的粗估：${fmtMin(manualMin)} 左右**（${r.totalRows} 行，按每行 9 秒、每处问题另加 6 分钟算）。`);
    L.push(`脚本搭好之后，同样这份数据每次重跑大约 ${Math.max(1, Math.round(manualMin / 60))} 分钟 —— 省下来的全部是「每次都要重来一遍」的那部分。`);
    L.push('所以：**只做一次、以后不再有的数据，手工更快，别花钱。**');
    if (r.totalRows <= 30 && r.sheets.length <= 2 && rp <= 2) {
      L.push('');
      L.push('**建议：诚实说 —— 这点数据量手工做更快。我可以直接告诉你怎么做，不用买脚本。**');
    } else {
      L.push('');
      const band = (r.totalRows <= 200 && rp <= 3) ? '简单（20~50 元）'
        : (r.totalRows <= 5000 && rp <= 10) ? '中等（80~200 元）'
        : '复杂（300~800 元）';
      L.push(`按上面这份的规模与脏乱程度，粗略落在 **${band}** 这一档（真实报价看你具体要什么，这份只是参考）。`);
      L.push('');
      L.push('## 【下一步】');
      L.push('- 把这份报告连着原始文件（脱敏也行）发我，我按它给明确报价和工期。');
      L.push('- 闲鱼搜「数据处理 数据提取」，或搜用户名 **tb40226286**。');
      L.push('- 想知道我到底做没做过、做成什么样：https://iv-vj.github.io/mectools/sample.html');
    }
    return L.join('\n');
  }

  global.MGHealth = { inspect, buildMarkdown, parseNum, parseDate, normCol, isBlank, toHalf, cleanText };
})(window);
