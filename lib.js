/* 机械设计计算核心库 —— 纯函数，无依赖 */
window.MG = (function () {
  const PI = Math.PI, cos = Math.cos, sin = Math.sin, tan = Math.tan;
  const D2R = PI / 180, R2D = 180 / PI;
  const acos = x => Math.acos(Math.max(-1, Math.min(1, x)));

  /* 渐开线函数 inv(α) = tanα − α */
  const inv = a => tan(a) - a;

  /* 标准直齿圆柱齿轮几何（外啮合，标准齿，x=0）
     o = {m, z1, z2, alphaDeg, haStar, cStar} */
  function gearPair(o) {
    const m = +o.m, z1 = +o.z1, z2 = +o.z2;
    const al = (+o.alphaDeg || 20) * D2R;
    const ha = (o.haStar === undefined ? 1 : +o.haStar);
    const c = (o.cStar === undefined ? 0.25 : +o.cStar);
    if (!(m > 0) || !(z1 >= 3) || !(z2 >= 3)) return { error: '模数需>0，齿数需≥3' };

    const d1 = m * z1, d2 = m * z2;
    const db1 = d1 * cos(al), db2 = d2 * cos(al);
    const dag = 2 * ha * m, dfg = 2 * (ha + c) * m;
    const da1 = d1 + dag, da2 = d2 + dag;
    const df1 = d1 - dfg, df2 = d2 - dfg;
    const a = (d1 + d2) / 2;
    const i = z2 / z1;
    const p = PI * m, s = p / 2;

    // 齿顶圆压力角
    const aa1 = acos(db1 / da1), aa2 = acos(db2 / da2);
    // 齿顶厚（防变尖校验）
    const sBase1 = s / d1 + inv(al), sBase2 = s / d2 + inv(al);
    const sa1 = da1 * (sBase1 - inv(aa1)), sa2 = da2 * (sBase2 - inv(aa2));
    // 重合度 εα = [z1(tanαa1−tanα′) + z2(tanαa2−tanα′)] / 2π  （标准啮合 α′=α）
    const eps = (z1 * (tan(aa1) - tan(al)) + z2 * (tan(aa2) - tan(al))) / (2 * PI);
    // 不根切最少齿数 zmin = 2ha*/sin²α
    const zmin = 2 * ha / (sin(al) * sin(al));

    return {
      m, z1, z2, alphaDeg: al * R2D, ha, c,
      d1, d2, db1, db2, da1, da2, df1, df2,
      ha1: ha * m, hf1: (ha + c) * m, h1: (2 * ha + c) * m,
      p, s, a, i, aa1: aa1 * R2D, aa2: aa2 * R2D,
      sa1, sa2, eps, zmin,
      undercut1: z1 < zmin, undercut2: z2 < zmin,
      sharp1: sa1 < 0.25 * m, sharp2: sa2 < 0.25 * m
    };
  }

  /* 生成齿轮端面闭合轮廓点 [[x,y],...]（含齿根过渡圆角，简化径向齿根） */
  function gearProfile(o) {
    const r = gearPair(o);
    if (r.error) return null;
    const m = r.m, z = r.z1, al = r.alphaDeg * D2R;
    const rp = r.d1 / 2, ra = r.da1 / 2, rf = r.df1 / 2, rb = r.db1 / 2;
    const P = 2 * PI / z;
    const psi = R => (PI / (2 * z) + inv(al)) - inv(acos(rb / R));
    const psib = psi(rb), psia = psi(ra);
    const rho = 0.38 * m;
    const rt = Math.sqrt(rf * rf + 2 * rf * rho);
    const th = psib + Math.asin(rho / (rf + rho));
    const pol = (R, A) => [R * cos(A), R * sin(A)];
    const pts = [];
    for (let k = 0; k < z; k++) {
      const c = k * P;
      const put = p => pts.push(p);
      // 左齿根圆角 Pe(rf) -> Cc(rt)
      const cx = (rf + rho) * cos(c - th), cy = (rf + rho) * sin(c - th);
      const a0 = Math.atan2(rt * sin(c - psib) - cy, rt * cos(c - psib) - cx);
      const a1 = Math.atan2(rf * sin(c - th) - cy, rf * cos(c - th) - cx);
      let dd = a0 - a1; while (dd > PI) dd -= 2 * PI; while (dd < -PI) dd += 2 * PI;
      for (let i = 0; i < 3; i++) { const t = a1 + dd * i / 2; put([cx + rho * cos(t), cy + rho * sin(t)]); }
      put(pol(rb, c - psib));
      for (let i = 1; i <= 4; i++) { const R = rb + (ra - rb) * i / 4; put(pol(R, c - psi(R))); }
      put(pol(ra, c));
      for (let i = 1; i <= 4; i++) { const R = ra - (ra - rb) * i / 4; put(pol(R, c + psi(R))); }
      put(pol(rt, c + psib));
      const ex = (rf + rho) * cos(c + th), ey = (rf + rho) * sin(c + th);
      const b0 = Math.atan2(rt * sin(c + psib) - ey, rt * cos(c + psib) - ex);
      const b1 = Math.atan2(rf * sin(c + th) - ey, rf * cos(c + th) - ex);
      let d2 = b1 - b0; while (d2 > PI) d2 -= 2 * PI; while (d2 < -PI) d2 += 2 * PI;
      for (let i = 1; i <= 2; i++) { const t = b0 + d2 * i / 2; put([ex + rho * cos(t), ey + rho * sin(t)]); }
      put(pol(rf, c + th + (P - 2 * th) * 0.5));
    }
    return pts;
  }

  /* V 带传动（普通 V 带，单根基准额定功率用插值近似） */
  function beltDrive(o) {
    const P = +o.power, n1 = +o.n1, dd1 = +o.dd1, i = +o.ratio, ka = +o.ka || 1.2;
    if (!(P > 0) || !(n1 > 0) || !(dd1 > 0) || !(i > 0)) return { error: '输入需为正数' };
    const Pd = P * ka;                     // 计算功率
    const dd2 = Math.round(dd1 * i);
    const v = PI * dd1 * n1 / 60000;       // 带速 m/s
    const a0min = 0.7 * (dd1 + dd2), a0max = 2 * (dd1 + dd2);
    const a0 = (a0min + a0max) / 2;
    const Ld0 = 2 * a0 + PI * (dd1 + dd2) / 2 + (dd2 - dd1) ** 2 / (4 * a0);
    const a = a0 + (Ld0 - Ld0) / 2;        // 待选标准带长后回代
    const alpha1 = 180 - (dd2 - dd1) / a * 57.3;
    return { Pd, dd2, v, a0min, a0max, a0, Ld0, alpha1,
             warn_v: v < 5 ? '带速偏低(<5 m/s)，传递能力不足' : (v > 25 ? '带速过高(>25 m/s)，需重选' : ''),
             warn_a: alpha1 < 120 ? '小轮包角<120°，需增大中心距' : '' };
  }

  /* 轴：弯扭合成强度校核（第三强度理论） */
  function shaftCheck(o) {
    const M = +o.M, T = +o.T, d = +o.d, sigma = +o.sigma, alpha = +o.alpha;
    if (!(d > 0) || !(sigma > 0)) return { error: '直径与许用应力需为正' };
    const W = PI * d ** 3 / 32;                     // 抗弯截面系数
    const WT = PI * d ** 3 / 16;                    // 抗扭截面系数
    const Mca = Math.sqrt(M * M + (alpha * T) ** 2); // 计算弯矩
    const sBend = M / W, sTor = T / WT, sCa = Mca / W;
    const n = sigma / sCa;
    return { W, WT, Mca, sBend, sTor, sCa, n, pass: sCa <= sigma,
             dmin: Math.cbrt(32 * Mca / (PI * sigma)) };
  }

  /* 滚动轴承寿命 L10 = (C/P)^ε · 10^6 / (60n) 小时 */
  function bearingLife(o) {
    const C = +o.C, P = +o.P, n = +o.n, e = +o.epsilon || 3;
    if (!(C > 0) || !(P > 0) || !(n > 0)) return { error: 'C/P/n 需为正数' };
    const L10m = (C / P) ** e;
    const hours = L10m * 1e6 / (60 * n);
    return { ratio: C / P, L10m, hours,
             pass: hours >= (+o.need || 20000) };
  }

  /* 齿廓多边形面积（鞋带公式）与齿廓点数。
     用于核对齿廓生成是否与 CAD 基准一致：
     m=5, z1=10, z2=10, α=20° 时 n=170、A=1863.8127 mm²（与三维 CAD 模型比对过）。 */
  const shoelace = pts => {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[(i + 1) % pts.length];
      s += p[0] * q[1] - q[0] * p[1];
    }
    return Math.abs(s) / 2;
  };
  const gearArea = o => {
    const pts = gearProfile(o);
    return pts ? shoelace(pts) : NaN;
  };

  /* 齿轮端面齿形 SVG（纯字符串，无 DOM 依赖，可插入任意容器）。
     原 gear.html 里是自带 id 的私有实现，这里抽成公共函数：
       · 离线单文件版所有视图共用一个 DOM，id 必须加前缀 gi_ 避免冲突；
       · gear.html 复用它以消除重复实现，保持两边齿形完全一致。 */
  function gearSvg(o) {
    const pts = gearProfile(o);
    if (!pts) return '';
    const r = gearPair(o);
    if (r.error) return '';
    const S = 420, pad = 14;
    const scale = (S / 2 - pad) / (r.da1 / 2);
    const cx = S / 2, cy = S / 2;
    let dpath = '';
    pts.forEach((p, i) => {
      dpath += (i ? 'L' : 'M') + (cx + p[0] * scale).toFixed(2) + ' ' + (cy - p[1] * scale).toFixed(2);
    });
    dpath += 'Z';
    const db1 = r.db1 / 2 * scale, d1 = r.d1 / 2 * scale, df1 = r.df1 / 2 * scale;
    const circ = (rr, col) => '<circle cx="' + cx + '" cy="' + cy + '" r="' + rr.toFixed(2) +
      '" fill="none" stroke="' + col + '" stroke-width="1" stroke-dasharray="4 3"/>';
    return '<svg viewBox="0 0 ' + S + ' ' + S +
      '" style="width:100%;max-width:460px;background:#0b1016;border:1px solid var(--line);border-radius:8px">' +
      '<path d="' + dpath + '" fill="rgba(62,166,255,.10)" stroke="#3ea6ff" stroke-width="1.5" stroke-linejoin="round"/>' +
      circ(d1, '#8b9bab') + circ(db1, '#3fb950') + circ(df1, '#d29922') +
      '<circle cx="' + cx + '" cy="' + cy + '" r="' + (8 * scale).toFixed(2) + '" fill="#0b1016" stroke="#8b9bab" stroke-width="1"/>' +
      '</svg>' +
      '<p style="color:var(--dim);font-size:12.5px;margin:9px 0 0">' +
      '<span style="color:#8b9bab">— — 分度圆 d₁</span>　' +
      '<span style="color:#3fb950">— — 基圆 d<sub>b1</sub></span>　' +
      '<span style="color:#d29922">— — 齿根圆 d<sub>f1</sub></span>　' +
      '中心孔按 φ16 示意，仅表示齿形，非实际结构。</p>';
  }

  return { inv, gearPair, gearProfile, beltDrive, shaftCheck, bearingLife,
           gearSvg, gearArea, shoelace, D2R, R2D };
})();
