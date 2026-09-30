/* 声明式工具定义 —— 新增一个计算器只需在数组里加一项，无需写页面 */
window.MG = window.MG || {};
(function () {
  const PI = Math.PI, f = (x, n) => (Math.abs(x) < 1e-9 ? 0 : x).toFixed(n === undefined ? 3 : n);

  /* ================= 平键（GB/T 1096）轴径 → 键截面 b×h ================= */
  const KEY_TABLE = [
    [6, 8, 2, 2], [8, 10, 3, 3], [10, 12, 4, 4], [12, 17, 5, 5], [17, 22, 6, 6],
    [22, 30, 8, 7], [30, 38, 10, 8], [38, 44, 12, 8], [44, 50, 14, 9], [50, 58, 16, 10],
    [58, 65, 18, 11], [65, 75, 20, 12], [75, 85, 22, 14], [85, 95, 25, 14],
    [95, 110, 28, 16], [110, 130, 32, 18]
  ];
  function keySize(d) {
    for (let i = 0; i < KEY_TABLE.length; i++) {
      const r = KEY_TABLE[i];
      if (d > r[0] && d <= r[1]) return { b: r[2], h: r[3] };
    }
    return null;
  }

  /* ================= 滚子链节距表（GB/T 1243） ================= */
  /* [链号, 节距 p (mm), 单排极限拉伸载荷 Q (kN)] —— GB/T 1243 */
  const CHAIN = [
    ['08A', 12.70, 13.8], ['10A', 15.875, 21.8], ['12A', 19.05, 31.1], ['16A', 25.40, 55.6],
    ['20A', 31.75, 86.7], ['24A', 38.10, 124.6], ['28A', 44.45, 169.0], ['32A', 50.80, 222.4]
  ];

  /* ================= 螺栓公称直径 → 螺纹小径 d1 (mm) ================= */
  const BOLT = { 'M6': 4.917, 'M8': 6.647, 'M10': 8.376, 'M12': 10.106, 'M16': 13.835,
                 'M20': 17.294, 'M24': 20.752, 'M30': 26.211 };

  MG.TOOLS = [

    /* ---------------- ① 平键联接 ---------------- */
    {
      id: 'key',
      name: '平键联接强度校核',
      desc: '按轴径自动查 GB/T 1096 平键截面，校核挤压与剪切强度，并反算所需键长。',
      inputs: [
        { k: 'T', label: '传递扭矩 T', unit: 'N·m', def: 250 },
        { k: 'd', label: '轴径 d', unit: 'mm', def: 35 },
        { k: 'L', label: '键公称长度 L', unit: 'mm', def: 50 },
        { k: 'type', label: '键型', sel: [['A', 'A 型（圆头，常用）'], ['B', 'B 型（方头）'], ['C', 'C 型（单圆头）']], def: 'A' },
        { k: 'kind', label: '联接性质', sel: [['static', '静联接（轮毂固定）'], ['guide', '动联接（导向/滑移）']], def: 'static' }
      ],
      note: 'σ<sub>p</sub> = 4T / (d·h·l) ≤ [σ<sub>p</sub>]&nbsp;&nbsp;|&nbsp;&nbsp;τ = 2T / (d·b·l) ≤ [τ]' +
            '<br>工作长度 l：A 型 l = L − b，B 型 l = L，C 型 l = L − b/2。挤压面积高取 h/2。' +
            '<br>[σ<sub>p</sub>] 常用：钢轮毂静联接 100~150 MPa，铸铁 70~80 MPa；动联接 [p] 20~30 MPa。',
      run(v) {
        const T = +v.T * 1000, d = +v.d, L = +v.L, type = v.type;
        const ks = keySize(d);
        if (!ks) return { msgs: [['err', '轴径超出常用平键范围（>6 且 ≤130 mm）']], rows: [] };
        if (!(T > 0) || !(d > 0) || !(L > 0)) return { msgs: [['err', '扭矩、轴径、键长需为正数']], rows: [] };
        const b = ks.b, h = ks.h, k = h / 2;
        const l = type === 'A' ? L - b : (type === 'C' ? L - b / 2 : L);
        if (l <= 0) return { msgs: [['err', '键长太短，工作长度 ≤ 0，请加长键']], rows: [] };
        const sp = 4 * T / (d * h * l);
        const tau = 2 * T / (d * b * l);
        const guide = v.kind === 'guide';
        const spAll = guide ? 25 : 100, tauAll = guide ? 30 : 60;
        const lNeed = Math.max(4 * T / (d * h * spAll), 2 * T / (d * b * tauAll));
        const LNeed = type === 'A' ? lNeed + b : (type === 'C' ? lNeed + b / 2 : lNeed);
        const pass = sp <= spAll && tau <= tauAll;
        return {
          msgs: [[pass ? 'ok' : 'err',
            '挤压应力 σ<sub>p</sub> = ' + f(sp) + ' MPa ' + (sp <= spAll ? '≤' : '>') + ' [σ<sub>p</sub>] = ' + spAll +
            ' MPa；切应力 τ = ' + f(tau) + ' MPa ' + (tau <= tauAll ? '≤' : '>') + ' [τ] = ' + tauAll + ' MPa —— <b>' +
            (pass ? '强度合格' : '强度不足') + '</b>' + (pass ? '，挤压裕度 ' + f(spAll / sp, 2) + ' 倍。' :
            '，键长至少需 ' + f(LNeed, 1) + ' mm（建议取标准长度系列）。')]],
          rows: [
            ['推荐键截面 b × h（GB/T 1096）', f(b, 0) + ' × ' + f(h, 0), 'mm', true],
            ['键工作长度 l', f(l, 2), 'mm'],
            ['接触高度 k = h/2', f(k, 2), 'mm'],
            ['挤压应力 σ<sub>p</sub> = 4T/(d·h·l)', f(sp), 'MPa', true],
            ['许用挤压应力 [σ<sub>p</sub>]', f(spAll, 0), 'MPa'],
            ['切应力 τ = 2T/(d·b·l)', f(tau), 'MPa', true],
            ['许用切应力 [τ]', f(tauAll, 0), 'MPa'],
            ['所需最小工作长度 l<sub>min</sub>', f(lNeed, 2), 'mm', true],
            ['所需最小键公称长度 L<sub>min</sub>', f(LNeed, 2), 'mm', true],
            ['键传递的圆周力 F = 2T/d', f(2 * T / d / 1000, 3), 'kN']
          ]
        };
      }
    },

    /* ---------------- ② 滚子链传动 ---------------- */
    {
      id: 'chain',
      name: '滚子链传动设计与校核',
      desc: '按 A 系列滚子链计算链速、圆周力、压轴力、链节数与中心距，并给出齿数与链速预警。',
      inputs: [
        { k: 'P', label: '传递功率 P', unit: 'kW', def: 5 },
        { k: 'n1', label: '小链轮转速 n₁', unit: 'r/min', def: 720 },
        { k: 'z1', label: '小链轮齿数 z₁', unit: '—', def: 21 },
        { k: 'i', label: '传动比 i', unit: '—', def: 3 },
        { k: 'no', label: '链号（A 系列）', sel: CHAIN.map(c => [c[0], c[0] + '（节距 ' + c[1] + ' mm）']), def: '12A' },
        { k: 'ka', label: '工况系数 K<sub>A</sub>', unit: '—', def: 1.3 },
        { k: 'a0m', label: '初定中心距 a₀（链节数倍数）', unit: '×p', def: 40 }
      ],
      note: 'v = z₁·p·n₁ / 60000&nbsp;&nbsp;|&nbsp;&nbsp;F = 1000·P·K<sub>A</sub> / v&nbsp;&nbsp;|&nbsp;&nbsp;F<sub>p</sub> ≈ 1.2·K<sub>A</sub>·F' +
            '<br>L<sub>p</sub> = 2a₀/p + (z₁+z₂)/2 + [(z₂−z₁)/2π]²·p/a₀&nbsp;&nbsp;（须取偶数）' +
            '<br>推荐 z₁ ≥ 17（高速取 19~25）；滚子链推荐链速 ≤ 15 m/s；z₂ ≤ 120。',
      run(v) {
        const P = +v.P, n1 = +v.n1, z1 = +v.z1, i = +v.i, ka = +v.ka, a0m = +v.a0m;
        const rec = CHAIN.filter(c => c[0] === v.no)[0];
        if (!rec || !(P > 0) || !(n1 > 0) || !(z1 >= 5) || !(i > 0)) return { msgs: [['err', '请输入有效参数']], rows: [] };
        const p = rec[1];
        const z2 = Math.round(z1 * i);
        const v_ = z1 * p * n1 / 60000;
        const F = 1000 * P * ka / v_;
        const Fp = 1.2 * ka * F;
        const a0 = a0m * p;
        let Lp = 2 * a0 / p + (z1 + z2) / 2 + Math.pow((z2 - z1) / (2 * PI), 2) * p / a0;
        Lp = Math.round(Lp / 2) * 2;
        const x = Lp - (z1 + z2) / 2;
        const y = Math.pow((z2 - z1) / (2 * PI), 2) * 8;
        const a = p / 4 * (x + Math.sqrt(Math.max(0, x * x - y)));
        const msgs = [];
        msgs.push([v_ <= 15 ? 'ok' : 'err', '链速 v = ' + f(v_, 2) + ' m/s —— ' +
          (v_ <= 15 ? '在滚子链推荐范围内（≤15 m/s）。' : '<b>超过推荐上限 15 m/s</b>，需减小节距或降低转速。')]);
        if (z1 < 17) msgs.push(['warn', 'z₁ = ' + z1 + ' < 17，小链轮齿数偏少，多边形效应与冲击加大，建议提高到 19~25。']);
        if (z2 > 120) msgs.push(['warn', 'z₂ = ' + z2 + ' > 120，链条磨损后易脱链，建议减小传动比或增大 z₁。']);
        if (Lp % 2 !== 0) msgs.push(['warn', '链节数为奇数，须加过渡链节，建议调整中心距使其为偶数。']);
        if (v_ > 0.6 && v_ < 8) msgs.push(['ok', '链速位于常用经济区间（0.6~8 m/s）。']);
        return {
          msgs,
          rows: [
            ['链号 / 节距 p', v.no + ' / ' + f(p, 3), 'mm', true],
            ['大链轮齿数 z₂', f(z2, 0), '—', true],
            ['平均链速 v', f(v_, 3), 'm/s', true],
            ['圆周力 F = 1000PK<sub>A</sub>/v', f(F, 1), 'N'],
            ['压轴力 F<sub>p</sub> ≈ 1.2K<sub>A</sub>F', f(Fp, 1), 'N'],
            ['初定中心距 a₀', f(a0, 1), 'mm'],
            ['链节数 L<sub>p</sub>（取偶）', f(Lp, 0), '节', true],
            ['实际中心距 a', f(a, 2), 'mm', true],
            ['链条总长 = L<sub>p</sub>·p', f(Lp * p, 1), 'mm'],
            ['建议 z₁ 下限', '17', '—'],
            ['链条单排极限拉伸载荷 Q', f(rec[2], 2), 'kN']
          ]
        };
      }
    },

    /* ---------------- ③ 圆柱螺旋压缩弹簧 ---------------- */
    {
      id: 'spring',
      name: '圆柱螺旋压缩弹簧',
      desc: '旋绕比、曲度系数、刚度、变形量、切应力校核，以及自由高度与稳定性判断。',
      inputs: [
        { k: 'd', label: '弹簧丝直径 d', unit: 'mm', def: 4 },
        { k: 'D', label: '弹簧中径 D', unit: 'mm', def: 25 },
        { k: 'n', label: '有效圈数 n', unit: '—', def: 8 },
        { k: 'F', label: '工作载荷 F', unit: 'N', def: 300 },
        { k: 't', label: '节距 t', unit: 'mm', def: 9 },
        { k: 'G', label: '切变模量 G', unit: 'MPa', def: 79000 },
        { k: 'tauAllow', label: '许用切应力 [τ]', unit: 'MPa', def: 450 },
        { k: 'end', label: '端部结构', sel: [['YI', '端部并紧磨平（常用）'], ['YII', '端部并紧不磨平'], ['YIII', '端部不并紧']], def: 'YI' }
      ],
      note: '旋绕比 C = D/d（推荐 4~16）&nbsp;&nbsp;|&nbsp;&nbsp;曲度系数 K = (4C−1)/(4C−4) + 0.615/C' +
            '<br>刚度 F′ = Gd⁴ / (8D³n)&nbsp;&nbsp;|&nbsp;&nbsp;变形 λ = F / F′ = 8FD³n / (Gd⁴)&nbsp;&nbsp;|&nbsp;&nbsp;τ = 8KFD / (πd³)' +
            '<br>自由高度 H₀：并紧磨平 n·t + 1.5d；并紧不磨平 n·t + 2d；不并紧 n·t + 3d（教材常用值）。' +
            '<br>稳定性：两端固定 b = H₀/D ≤ 5.3，一端固定一端自由 ≤ 3.7。',
      run(v) {
        const d = +v.d, D = +v.D, n = +v.n, F = +v.F, t = +v.t, G = +v.G, ta = +v.tauAllow;
        if (!(d > 0) || !(D > d) || !(n > 0) || !(t > d)) return { msgs: [['err', '需满足 d>0、D>d、n>0、t>d']], rows: [] };
        const C = D / d;
        const K = (4 * C - 1) / (4 * C - 4) + 0.615 / C;
        const kp = G * Math.pow(d, 4) / (8 * Math.pow(D, 3) * n);
        const lam = F / kp;
        const tau = 8 * K * F * D / (PI * Math.pow(d, 3));
        const tRec = [0.28 * D, 0.5 * D];
        let H0, Hb, n2;
        if (v.end === 'YI') { n2 = 2; H0 = n * t + 1.5 * d; Hb = (n + 1.5) * d; }
        else if (v.end === 'YII') { n2 = 2; H0 = n * t + 2 * d; Hb = (n + 2) * d; }
        else { n2 = 0; H0 = n * t + 3 * d; Hb = (n + 2.5) * d; }
        const b = H0 / D;
        const pass = tau <= ta;
        const msgs = [];
        msgs.push([pass ? 'ok' : 'err', '工作切应力 τ = ' + f(tau, 1) + ' MPa ' + (pass ? '≤' : '>') +
          ' [τ] = ' + f(ta, 0) + ' MPa —— <b>' + (pass ? '强度合格' : '强度不足，需加大弹簧丝直径或换材料') + '</b>' +
          (pass ? '，裕度 ' + f(ta / tau, 2) + ' 倍。' : '')]);
        if (C < 4) msgs.push(['warn', '旋绕比 C = ' + f(C, 2) + ' < 4，卷制困难、内侧应力集中严重，建议增大中径或减小丝径。']);
        else if (C > 16) msgs.push(['warn', '旋绕比 C = ' + f(C, 2) + ' > 16，弹簧过软、易颤动，建议减小中径或加大丝径。']);
        else msgs.push(['ok', '旋绕比 C = ' + f(C, 2) + ' 位于推荐区间 4~16。']);
        if (t < tRec[0] || t > tRec[1]) msgs.push(['warn', '节距 t = ' + f(t, 2) + ' mm 不在推荐区间 ' + f(tRec[0], 2) + '~' + f(tRec[1], 2) + ' mm（0.28D~0.5D）。']);
        msgs.push([b <= 5.3 ? 'ok' : 'warn', '高径比 b = H₀/D = ' + f(b, 2) + (b <= 5.3 ? ' ≤ 5.3（两端固定）稳定性满足。' : ' > 5.3，<b>可能失稳</b>，需加导杆/导套或重选参数。')]);
        if (F >= kp * (H0 - Hb)) msgs.push(['err', '工作载荷已使弹簧压并（最大变形仅 ' + f(H0 - Hb, 2) + ' mm），须减小载荷或加大自由高度。']);
        return {
          msgs,
          rows: [
            ['旋绕比 C = D/d', f(C, 2), '—', true],
            ['曲度系数 K', f(K, 3), '—', true],
            ['弹簧外径 D₂', f(D + d, 2), 'mm'],
            ['弹簧内径 D₁', f(D - d, 2), 'mm'],
            ['刚度 F′ = Gd⁴/(8D³n)', f(kp, 3), 'N/mm', true],
            ['工作变形 λ = F/F′', f(lam, 2), 'mm', true],
            ['压并变形 λ<sub>b</sub>', f(H0 - Hb, 2), 'mm'],
            ['工作切应力 τ = 8KFD/(πd³)', f(tau, 1), 'MPa', true],
            ['许用切应力 [τ]', f(ta, 0), 'MPa'],
            ['总圈数 n₁ = n + ' + n2, f(n + n2, 1), '圈'],
            ['自由高度 H₀', f(H0, 2), 'mm', true],
            ['压并高度 H<sub>b</sub>', f(Hb, 2), 'mm'],
            ['高径比 b = H₀/D', f(b, 3), '—', true],
            ['推荐节距范围 0.28D~0.5D', f(tRec[0], 2) + ' ~ ' + f(tRec[1], 2), 'mm'],
            ['工作载荷下弹簧高度', f(H0 - lam, 2), 'mm']
          ]
        };
      }
    },

    /* ---------------- ④ 螺栓组（受轴向载荷） ---------------- */
    {
      id: 'bolt',
      name: '螺栓组联接强度校核',
      desc: '受轴向工作载荷的螺栓组：预紧力、残余预紧力、螺栓总拉力与拉应力校核。',
      inputs: [
        { k: 'Fsum', label: '总轴向工作载荷 ΣF', unit: 'N', def: 40000 },
        { k: 'z', label: '螺栓个数 z', unit: '—', def: 8 },
        { k: 'size', label: '螺纹公称直径', sel: Object.keys(BOLT).map(m => [m, m + '（小径 d₁ = ' + BOLT[m] + ' mm）']), def: 'M16' },
        { k: 'kc', label: '相对刚度 K<sub>c</sub>', unit: '—', def: 0.3 },
        { k: 'seal', label: '密封要求', sel: [['tight', '压力容器/有密封（F″ = 1.5~1.8F）'], ['normal', '一般联接（F″ = 0.2~0.6F）']], def: 'normal' },
        { k: 'sigma', label: '许用拉应力 [σ]', unit: 'MPa', def: 120 }
      ],
      note: '单栓工作拉力 F = ΣF / z&nbsp;&nbsp;|&nbsp;&nbsp;残余预紧力 F″ = (1.5~1.8)F 或 (0.2~0.6)F（取中值计算）' +
            '<br>螺栓总拉力 F₀ = F″ + F&nbsp;&nbsp;|&nbsp;&nbsp;预紧力 F′ = F₀ − (1−K<sub>c</sub>)F' +
            '<br>强度条件 σ = 1.3F₀ / (πd₁²/4) ≤ [σ]，系数 1.3 计入拧紧时的扭转剪应力。',
      run(v) {
        const Fsum = +v.Fsum, z = +v.z, kc = +v.kc, sg = +v.sigma;
        const d1 = BOLT[v.size];
        if (!(Fsum > 0) || !(z >= 1) || !(sg > 0)) return { msgs: [['err', '请输入有效参数']], rows: [] };
        const F = Fsum / z;
        const ratio = v.seal === 'tight' ? 1.65 : 0.4;
        const Fpp = ratio * F;
        const F0 = Fpp + F;
        const Fp = F0 - (1 - kc) * F;
        const A1 = PI * d1 * d1 / 4;
        const sigma = 1.3 * F0 / A1;
        const pass = sigma <= sg;
        const F0max = sg * A1 / 1.3;
        return {
          msgs: [[pass ? 'ok' : 'err', '螺栓拉应力 σ = ' + f(sigma, 1) + ' MPa ' + (pass ? '≤' : '>') + ' [σ] = ' + f(sg, 0) +
            ' MPa —— <b>' + (pass ? '强度合格' : '强度不足，需增大直径或增加螺栓数') + '</b>' +
            (pass ? '，裕度 ' + f(sg / sigma, 2) + ' 倍。' : '，单栓总拉力上限 ' + f(F0max, 0) + ' N。')]],
          rows: [
            ['单栓工作拉力 F = ΣF/z', f(F, 1), 'N', true],
            ['残余预紧力系数（取中值）', f(ratio, 2), '—'],
            ['残余预紧力 F″', f(Fpp, 1), 'N', true],
            ['螺栓总拉力 F₀ = F″ + F', f(F0, 1), 'N', true],
            ['预紧力 F′ = F₀ − (1−K<sub>c</sub>)F', f(Fp, 1), 'N', true],
            ['螺纹小径 d₁', f(d1, 3), 'mm'],
            ['危险截面积 A₁ = πd₁²/4', f(A1, 2), 'mm²'],
            ['拉应力 σ = 1.3F₀/A₁', f(sigma, 1), 'MPa', true],
            ['许用拉应力 [σ]', f(sg, 0), 'MPa'],
            ['单栓允许最大总拉力', f(F0max, 1), 'N', true],
            ['建议拧紧力矩取值的依据', 'F′ 与摩擦系数', '']
          ]
        };
      }
    },

    /* ---------------- ⑤ 齿轮强度校核（接触 + 弯曲） ---------------- */
    {
      id: 'gearstrength',
      name: '齿轮强度校核（接触 + 弯曲）',
      desc: '齿面接触应力 σH 与齿根弯曲应力 σF 校核。重合度系数与齿形系数均由齿数自动算出，也可切换为手动取值。',
      inputs: [
        { k: 'T1', label: '小齿轮扭矩 T₁', unit: 'N·m', def: 120 },
        { k: 'm', label: '模数 m', unit: 'mm', def: 3 },
        { k: 'z1', label: '小齿轮齿数 z₁', unit: '—', def: 20 },
        { k: 'z2', label: '大齿轮齿数 z₂', unit: '—', def: 60 },
        { k: 'b', label: '齿宽 b', unit: 'mm', def: 30 },
        { k: 'K', label: '载荷系数 K', unit: '—', def: 1.5 },
        { k: 'ZE', label: '弹性系数 Z<sub>E</sub>（钢-钢 189.8）', unit: '√MPa', def: 189.8 },
        { k: 'ZH', label: '节点区域系数 Z<sub>H</sub>（标准直齿 2.5）', unit: '—', def: 2.5 },
        { k: 'sHlim', label: '接触疲劳极限 σ<sub>Hlim</sub>', unit: 'MPa', def: 1200 },
        { k: 'SH', label: '接触强度安全系数 S<sub>H</sub>', unit: '—', def: 1.0 },
        { k: 'coef', label: '齿形系数取值方式', sel: [['auto', '按齿数自动查表（标准齿 ρ=0.38m）'], ['manual', '手动输入（变位 / 内齿轮等）']], def: 'auto' },
        { k: 'YFa', label: '齿形系数 Y<sub>Fa</sub>（仅手动方式生效）', unit: '—', def: 2.80 },
        { k: 'YSa', label: '应力修正系数 Y<sub>Sa</sub>（仅手动方式生效）', unit: '—', def: 1.55 },
        { k: 'sFlim', label: '弯曲疲劳极限 σ<sub>FE</sub>', unit: 'MPa', def: 600 },
        { k: 'SF', label: '弯曲强度安全系数 S<sub>F</sub>', unit: '—', def: 1.4 }
      ],
      note: '<b>接触强度</b> σ<sub>H</sub> = Z<sub>E</sub>·Z<sub>H</sub>·Z<sub>ε</sub>·√( 2K·T₁·(u+1) / (b·d₁²·u) )&nbsp;&nbsp;≤ [σ<sub>H</sub>] = σ<sub>Hlim</sub>/S<sub>H</sub>' +
            '<br><b>重合度系数</b> Z<sub>ε</sub> = √( (4 − ε<sub>α</sub>) / 3 )，Z<sub>ε</sub> 与 ε<sub>α</sub> 由本页按标准直齿轮几何自动求得。' +
            '<br><b>弯曲强度</b> σ<sub>F</sub> = 2K·T₁·Y<sub>Fa</sub>·Y<sub>Sa</sub>·Y<sub>ε</sub> / (b·m²·z₁)&nbsp;&nbsp;≤ [σ<sub>F</sub>] = σ<sub>FE</sub>/S<sub>F</sub>' +
            '<br><b>重合度系数</b> Y<sub>ε</sub> = 0.25 + 0.75/ε<sub>α</sub>' +
            '<br><b>关于 Y<sub>Fa</sub>、Y<sub>Sa</sub></b>：本工具内置标准齿形系数表（z = 17…200 及 z→∞，α = 20°、齿根圆角 ρ = 0.38m），' +
            '按 <b>z₁ 线性插值</b>自动取值，结果区会标出实际取用的数值。' +
            '变位齿轮、内齿轮（表值 Y<sub>Fa</sub> ≈ Y<sub>Sa</sub> ≈ 2.65）或非标齿根圆角，请切到「手动输入」自行填值。' +
            'z₁ &lt; 17 时按表中 z = 17 取值并给出根切提示 —— 根切会削弱齿根、使真实 Y<sub>Fa</sub> 偏大，故本页 σ<sub>F</sub> 偏乐观。' +
            '<br>载荷系数 K = K<sub>A</sub>·K<sub>v</sub>·K<sub>β</sub>·K<sub>α</sub>，平稳载荷约 1.2~1.6，有冲击取 1.6~2.2。',
      run(v) {
        const T1 = +v.T1 * 1000, m = +v.m, z1 = +v.z1, z2 = +v.z2, b = +v.b, K = +v.K;
        const ZE = +v.ZE, ZH = +v.ZH, sHlim = +v.sHlim, SH = +v.SH;
        const sFlim = +v.sFlim, SF = +v.SF;
        // 标准齿形系数表（α=20°、齿根圆角 ρ=0.38m、无变位）；末节点代表 z→∞
        const YTAB = [[17, 2.97, 1.52], [18, 2.91, 1.53], [19, 2.85, 1.54], [20, 2.80, 1.55], [21, 2.76, 1.56],
                      [22, 2.72, 1.57], [23, 2.69, 1.575], [24, 2.65, 1.58], [25, 2.62, 1.59], [26, 2.60, 1.595],
                      [27, 2.57, 1.60], [28, 2.55, 1.61], [29, 2.53, 1.62], [30, 2.52, 1.625], [35, 2.45, 1.65],
                      [40, 2.40, 1.67], [45, 2.35, 1.68], [50, 2.32, 1.70], [60, 2.28, 1.73], [70, 2.24, 1.75],
                      [80, 2.22, 1.77], [90, 2.20, 1.78], [100, 2.18, 1.79], [150, 2.14, 1.83], [200, 2.12, 1.865],
                      [100000, 2.06, 1.97]];
        const yfaOf = function (z) {
          if (z <= YTAB[0][0]) return [YTAB[0][1], YTAB[0][2], true];
          for (let i = 0; i < YTAB.length - 1; i++) {
            if (z <= YTAB[i + 1][0]) {
              const t = (z - YTAB[i][0]) / (YTAB[i + 1][0] - YTAB[i][0]);
              return [YTAB[i][1] + t * (YTAB[i + 1][1] - YTAB[i][1]),
                      YTAB[i][2] + t * (YTAB[i + 1][2] - YTAB[i][2]), false];
            }
          }
          return [YTAB[YTAB.length - 1][1], YTAB[YTAB.length - 1][2], false];
        };
        const hit = yfaOf(z1);
        const useAuto = v.coef !== 'manual';
        const YFa = useAuto ? hit[0] : +v.YFa, YSa = useAuto ? hit[1] : +v.YSa;
        if (!(YFa > 0) || !(YSa > 0)) return { msgs: [['err', '齿形系数与应力修正系数需为正数']], rows: [] };
        if (!(T1 > 0) || !(m > 0) || !(z1 >= 3) || !(z2 >= 3) || !(b > 0) || !(K > 0))
          return { msgs: [['err', '扭矩、模数、齿数、齿宽、载荷系数需为正数']], rows: [] };
        if (!(ZE > 0) || !(ZH > 0) || !(SH > 0) || !(SF > 0))
          return { msgs: [['err', '系数与安全系数需为正数']], rows: [] };

        const g = MG.gearPair({ m: m, z1: z1, z2: z2, alphaDeg: 20 });
        const d1 = m * z1, u = z2 / z1;
        const eps = g.eps;
        const Ze = Math.sqrt(Math.max(0.05, (4 - eps) / 3));
        const Ye = 0.25 + 0.75 / eps;
        const sH = ZE * ZH * Ze * Math.sqrt(2 * K * T1 * (u + 1) / (b * d1 * d1 * u));
        const sF = 2 * K * T1 * YFa * YSa * Ye / (b * m * m * z1);
        const sHallow = sHlim / SH, sFallow = sFlim / SF;
        const okH = sH <= sHallow, okF = sF <= sFallow;
        // 反算：按 [σH] 允许的最大扭矩；按 [σF] 允许的最大扭矩
        const T1H = sHallow * sHallow * b * d1 * d1 * u / (2 * K * (u + 1) * Math.pow(ZE * ZH * Ze, 2));
        const T1F = sFallow * b * m * m * z1 / (2 * K * YFa * YSa * Ye);
        const msgs = [];
        if (useAuto && hit[2]) msgs.push(['warn', 'z₁ = ' + z1 + ' &lt; 17，本页已按表中 z = 17 取值。该齿轮存在<b>根切</b>风险，根切削弱齿根、真实 Y<sub>Fa</sub> 更大，故 σ<sub>F</sub> 结果偏乐观；建议取 z₁ ≥ 17 或采用变位。']);
        if (useAuto && z1 > 200) msgs.push(['warn', 'z₁ &gt; 200，超出表格节点范围，齿形系数按 z = 200 与 z→∞ 两节点线性插值近似（该区间曲线已很平缓，误差极小）。']);
        msgs.push([okH ? 'ok' : 'err', '齿面接触应力 σ<sub>H</sub> = ' + f(sH, 1) + ' MPa ' + (okH ? '≤' : '>') +
          ' [σ<sub>H</sub>] = ' + f(sHallow, 1) + ' MPa —— <b>' + (okH ? '接触强度合格' : '接触强度不足') + '</b>' +
          (okH ? '，裕度 ' + f(sHallow / sH, 2) + ' 倍。' : '，需增大齿宽/模数或降低扭矩。')]);
        msgs.push([okF ? 'ok' : 'err', '齿根弯曲应力 σ<sub>F</sub> = ' + f(sF, 1) + ' MPa ' + (okF ? '≤' : '>') +
          ' [σ<sub>F</sub>] = ' + f(sFallow, 1) + ' MPa —— <b>' + (okF ? '弯曲强度合格' : '弯曲强度不足') + '</b>' +
          (okF ? '，裕度 ' + f(sFallow / sF, 2) + ' 倍。' : '，需增大模数或齿宽。')]);
        msgs.push([okH && okF ? 'ok' : 'warn', '两项都满足时才合格。若要提高承载能力：' +
          (okH && okF ? '当前按本组参数已合格，可反查下面的允许扭矩看还有多少余量。'
                      : (okH ? '瓶颈在<b>齿根弯曲</b>，优先增大模数。' : '瓶颈在<b>齿面接触</b>，优先增大齿宽或中心距。'))]);
        return {
          msgs,
          rows: [
            ['分度圆直径 d₁ / d₂', f(d1, 2) + ' / ' + f(m * z2, 2), 'mm'],
            ['齿数比 u = z₂/z₁', f(u, 4), '—'],
            ['端面重合度 ε<sub>α</sub>（标准直齿）', f(eps, 4), '—', true],
            ['重合度系数 Z<sub>ε</sub> = √((4−ε<sub>α</sub>)/3)', f(Ze, 4), '—', true],
            ['重合度系数 Y<sub>ε</sub> = 0.25 + 0.75/ε<sub>α</sub>', f(Ye, 4), '—', true],
            ['齿形系数 Y<sub>Fa</sub>（' + (useAuto ? '按 z₁ 查表插值' : '手动输入') + '）', f(YFa, 3), '—', true],
            ['应力修正系数 Y<sub>Sa</sub>（' + (useAuto ? '按 z₁ 查表插值' : '手动输入') + '）', f(YSa, 3), '—', true],
            ['乘积 Y<sub>Fa</sub>·Y<sub>Sa</sub>', f(YFa * YSa, 4), '—'],
            ['齿宽系数 φ<sub>d</sub> = b/d₁', f(b / d1, 3), '—'],
            ['齿面接触应力 σ<sub>H</sub>', f(sH, 1), 'MPa', true],
            ['许用接触应力 [σ<sub>H</sub>] = σ<sub>Hlim</sub>/S<sub>H</sub>', f(sHallow, 1), 'MPa', true],
            ['接触强度安全裕度', f(sHallow / sH, 3), '—'],
            ['齿根弯曲应力 σ<sub>F</sub>', f(sF, 1), 'MPa', true],
            ['许用弯曲应力 [σ<sub>F</sub>] = σ<sub>FE</sub>/S<sub>F</sub>', f(sFallow, 1), 'MPa', true],
            ['弯曲强度安全裕度', f(sFallow / sF, 3), '—'],
            ['按接触强度允许的最大 T₁', f(T1H / 1000, 2), 'N·m', true],
            ['按弯曲强度允许的最大 T₁', f(T1F / 1000, 2), 'N·m', true],
            ['由接触强度反算所需齿宽 b', f(2 * K * T1 * (u + 1) * Math.pow(ZE * ZH * Ze, 2) / (d1 * d1 * u * sHallow * sHallow), 2), 'mm'],
            ['由弯曲强度反算所需模数 m', f(Math.sqrt(2 * K * T1 * YFa * YSa * Ye / (b * z1 * sFallow)), 3), 'mm']
          ]
        };
      }
    },

    /* ---------------- ⑥ 螺纹基本尺寸与升角 ---------------- */
    {
      id: 'thread',
      name: '螺纹基本尺寸与升角',
      desc: '按 GB/T 196 / 197 计算米制普通螺纹的中径、小径、牙型高度，并算螺纹升角与自锁判断。',
      inputs: [
        { k: 'd', label: '公称直径 d', sel: [['3', 'M3'], ['4', 'M4'], ['5', 'M5'], ['6', 'M6'], ['8', 'M8'],
            ['10', 'M10'], ['12', 'M12'], ['14', 'M14'], ['16', 'M16'], ['18', 'M18'], ['20', 'M20'],
            ['22', 'M22'], ['24', 'M24'], ['27', 'M27'], ['30', 'M30'], ['33', 'M33'], ['36', 'M36'],
            ['39', 'M39'], ['42', 'M42'], ['45', 'M45'], ['48', 'M48'], ['52', 'M52'], ['56', 'M56'],
            ['60', 'M60'], ['64', 'M64']], def: '10' },
        { k: 'Pmode', label: '螺距方式', sel: [['coarse', '粗牙（标准螺距）'], ['fine', '细牙（用下方数值）']], def: 'coarse' },
        { k: 'Pf', label: '细牙螺距 P（细牙方式生效）', unit: 'mm', def: 1.25 },
        { k: 'n', label: '线数 n（单线螺纹为 1）', unit: '—', def: 1 },
        { k: 'mu', label: '摩擦系数 μ（自锁判断用）', unit: '—', def: 0.10 }
      ],
      note: '<b>牙型基本尺寸</b>（GB/T 196，牙型角 60°）：' +
            '原始三角形高度 H = (√3/2)·P；牙型工作高度 h₁ = 0.5413·P；' +
            '中径 <b>d₂ = d − 0.6495·P</b>；小径 <b>d₁ = d − 1.0825·P</b>；强度计算用的小径 d₃ = d − 1.2269·P。' +
            '<br><b>螺纹升角</b> ψ = arctan( P<sub>h</sub> / (π·d₂) )，P<sub>h</sub> = n·P 为导程（单线时 P<sub>h</sub> = P）。' +
            '<br><b>自锁条件</b> ψ ≤ ρ′，ρ′ 为当量摩擦角，ρ′ = arctan( μ / cos(α/2) )，普通螺纹 α = 60° → cos30° = 0.866。' +
            '钢-钢无润滑 μ ≈ 0.10~0.15，有润滑 ≈ 0.05~0.10 —— <b>μ 越小越难自锁</b>，所以判断时取偏小的 μ 才安全。' +
            '<br>粗牙螺距为标准值；细牙螺距常见 0.25 / 0.35 / 0.5 / 0.75 / 1 / 1.25 / 1.5 / 2，同一直径可有多种细牙。' +
            '<br><b>螺纹牙与螺栓的强度校核</b>请用「螺栓组联接强度校核」工具（那里按 d₁ 计算危险截面）。',
      run(v) {
        const d = +v.d, n = +v.n, mu = +v.mu;
        const COARSE = { 3: 0.5, 4: 0.7, 5: 0.8, 6: 1, 8: 1.25, 10: 1.5, 12: 1.75, 14: 2, 16: 2, 18: 2.5,
          20: 2.5, 22: 2.5, 24: 3, 27: 3, 30: 3.5, 33: 3.5, 36: 4, 39: 4, 42: 4.5, 45: 4.5, 48: 5,
          52: 5, 56: 5.5, 60: 5.5, 64: 6 };
        const P = v.Pmode === 'fine' ? +v.Pf : COARSE[d];
        if (!(d > 0) || !(P > 0)) return { msgs: [['err', '公称直径与螺距需为正数']], rows: [] };
        if (!(n >= 1)) return { msgs: [['err', '线数需 ≥ 1']], rows: [] };
        if (!(mu > 0) || mu >= 1) return { msgs: [['err', '摩擦系数需在 0 与 1 之间']], rows: [] };
        if (P >= d) return { msgs: [['err', '螺距不小于公称直径，不是有效的普通螺纹']], rows: [] };

        const D2 = Math.PI / 180;
        const H = Math.sqrt(3) / 2 * P;
        const h1 = 0.541266 * P;
        const d2 = d - 0.649519 * P;
        const d1 = d - 1.082532 * P;
        const d3 = d - 1.226869 * P;
        const Ph = n * P;
        const psi = Math.atan(Ph / (Math.PI * d2)) / D2;
        const rho = Math.atan(mu / Math.cos(30 * D2)) / D2;
        const lock = psi <= rho;
        const isCoarse = v.Pmode !== 'fine';
        const msgs = [];
        msgs.push(['ok', 'M' + d + ' × ' + f(P, 2) + (isCoarse ? '（粗牙标准螺距）' : '（细牙）') +
          '：中径 <b>d₂ = ' + f(d2, 3) + ' mm</b>，小径 <b>d₁ = ' + f(d1, 3) + ' mm</b>。']);
        msgs.push([lock ? 'ok' : 'err', '螺纹升角 ψ = ' + f(psi, 3) + '°，当量摩擦角 ρ′ = ' + f(rho, 3) + '°（μ = ' + f(mu, 2) +
          '）—— ' + (lock ? '<b>满足自锁条件</b> ψ ≤ ρ′。' : '<b>不满足自锁条件</b> ψ &gt; ρ′，作紧固用时需加防松措施，或改用细牙螺纹。')]);
        if (d3 <= 0) msgs.push(['warn', '螺距相对直径过大，强度计算用小径 d₃ 已非正数，请检查螺距取值。']);
        return {
          msgs,
          rows: [
            ['螺距 P', f(P, 3), 'mm', true],
            ['导程 P<sub>h</sub> = n·P', f(Ph, 3), 'mm'],
            ['原始三角形高度 H = (√3/2)P', f(H, 4), 'mm'],
            ['牙型工作高度 h₁ = 0.5413P', f(h1, 4), 'mm'],
            ['中径 d₂ = d − 0.6495P', f(d2, 4), 'mm', true],
            ['小径 d₁ = d − 1.0825P', f(d1, 4), 'mm', true],
            ['强度用小径 d₃ = d − 1.2269P', f(d3, 4), 'mm', true],
            ['中径处牙宽（理论值 P/2）', f(P / 2, 4), 'mm'],
            ['螺纹升角 ψ', f(psi, 4), '°', true],
            ['当量摩擦角 ρ′ = arctan(μ/cos30°)', f(rho, 4), '°'],
            ['自锁裕度 ρ′ / ψ', psi > 0 ? f(rho / psi, 3) : '—', '—'],
            ['公称截面积 A = π d²/4', f(Math.PI * d * d / 4, 2), 'mm²'],
            ['危险截面积 A₁ = π d₁²/4', f(Math.PI * d1 * d1 / 4, 2), 'mm²'],
            ['强度计算截面积 A₃ = π d₃²/4', f(Math.PI * d3 * d3 / 4, 2), 'mm²']
          ]
        };
      }
    },

    /* ---------------- ⑦ 梁的弯曲变形 ---------------- */
    {
      id: 'beam',
      name: '梁的弯曲变形（挠度与转角）',
      desc: '8 种常见支承与载荷组合下的最大挠度、截面转角与最大弯矩，并按许用挠度比自动校核。',
      inputs: [
        { k: 'cs', label: '支承与载荷', sel: [
            ['ss-c', '简支梁 · 跨中集中力 P'],
            ['ss-q', '简支梁 · 全跨均布载荷 q'],
            ['ss-e', '简支梁 · 偏心集中力 P'],
            ['cb-f', '悬臂梁 · 自由端集中力 P'],
            ['cb-q', '悬臂梁 · 全跨均布载荷 q'],
            ['cb-m', '悬臂梁 · 自由端集中力偶 M₀'],
            ['fx-c', '两端固定梁 · 跨中集中力 P'],
            ['fx-q', '两端固定梁 · 全跨均布载荷 q']
          ], def: 'ss-c' },
        { k: 'L', label: '跨度 L', unit: 'mm', def: 1000 },
        { k: 'a', label: '载荷位置 a（偏心方式用，自左端起）', unit: 'mm', def: 400 },
        { k: 'P', label: '集中力 P', unit: 'N', def: 1000 },
        { k: 'q', label: '均布载荷 q', unit: 'N/mm', def: 5 },
        { k: 'M0', label: '集中力偶 M₀', unit: 'N·mm', def: 100000 },
        { k: 'E', label: '弹性模量 E（钢 206000）', unit: 'MPa', def: 206000 },
        { k: 'I', label: '截面惯性矩 I', unit: 'mm⁴', def: 1000000 },
        { k: 'rt', label: '许用挠度 [f] = L /', unit: '—', def: 500 }
      ],
      note: '<b>常用截面惯性矩</b>（中性轴过形心）：' +
            '矩形 <b>I = b·h³/12</b>；实心圆 <b>I = πd⁴/64 ≈ 0.0491d⁴</b>；' +
            '圆管 <b>I = π(D⁴ − d⁴)/64</b>；工字钢、槽钢等查型钢表。' +
            '<br>E 取钢 206000 MPa、铸铁 120000 MPa、铝合金 70000 MPa、铜 110000 MPa。' +
            '<br><b>许用挠度</b>常见取值：一般轴 [f] = (0.0003~0.0005)L、<b>安装齿轮处 [f] = (0.01~0.03)m</b>（m 为模数）、' +
            '机床主轴 [f] = 0.0002L、桥式吊车梁 L/700、一般建筑梁 L/250~L/400。本页按 [f] = L/(下方分母) 校核。' +
            '<br>本页只做<b>弹性、小变形</b>计算。若计算挠度与跨度之比超过约 1/50，线性梁理论已不适用，结果仅供参考。' +
            '<br>简支梁偏心载荷的最大挠度出现在 x = √((L²−b²)/3) 处（b 为较短一段长度），本页据此计算。',
      run(v) {
        const L = +v.L, E = +v.E, I = +v.I, P = +v.P, q = +v.q, M0 = +v.M0, a = +v.a, rt = +v.rt;
        if (!(L > 0) || !(E > 0) || !(I > 0)) return { msgs: [['err', '跨度、弹性模量、截面惯性矩需为正数']], rows: [] };
        if (!(rt > 0)) return { msgs: [['err', '许用挠度分母需为正数']], rows: [] };
        const EI = E * I;
        let fmax = 0, thA = 0, thB = 0, Mmax = 0, where = '', label = '', Mmid = 0, Mfix = 0, fload = null;
        switch (v.cs) {
          case 'ss-c':
            label = '简支梁 · 跨中集中力 P'; if (!(P > 0)) return { msgs: [['err', '集中力需为正数']], rows: [] };
            fmax = P * L * L * L / (48 * EI); thA = thB = P * L * L / (16 * EI); Mmax = P * L / 4; where = '跨中';
            break;
          case 'ss-q':
            label = '简支梁 · 全跨均布载荷 q'; if (!(q > 0)) return { msgs: [['err', '均布载荷需为正数']], rows: [] };
            fmax = 5 * q * Math.pow(L, 4) / (384 * EI); thA = thB = q * L * L * L / (24 * EI); Mmax = q * L * L / 8; where = '跨中';
            break;
          case 'ss-e': {
            label = '简支梁 · 偏心集中力 P';
            if (!(P > 0)) return { msgs: [['err', '集中力需为正数']], rows: [] };
            if (!(a > 0) || !(a < L)) return { msgs: [['err', '载荷位置 a 需在 0 与跨度 L 之间']], rows: [] };
            const aa = a, bb = L - a, bs = Math.min(aa, bb);
            fmax = P * bs * Math.pow(L * L - bs * bs, 1.5) / (9 * Math.sqrt(3) * L * EI);
            fload = P * aa * aa * bb * bb / (3 * EI * L);
            thA = P * aa * bb * (L + bb) / (6 * EI * L);
            thB = P * aa * bb * (L + aa) / (6 * EI * L);
            Mmax = P * aa * bb / L;
            where = 'x = √((L²−b²)/3) = ' + f(Math.sqrt((L * L - bs * bs) / 3), 1) + ' mm 处';
            break;
          }
          case 'cb-f':
            label = '悬臂梁 · 自由端集中力 P'; if (!(P > 0)) return { msgs: [['err', '集中力需为正数']], rows: [] };
            fmax = P * L * L * L / (3 * EI); thA = P * L * L / (2 * EI); thB = thA; Mmax = P * L; where = '自由端'; Mfix = -P * L;
            break;
          case 'cb-q':
            label = '悬臂梁 · 全跨均布载荷 q'; if (!(q > 0)) return { msgs: [['err', '均布载荷需为正数']], rows: [] };
            fmax = q * Math.pow(L, 4) / (8 * EI); thA = q * L * L * L / (6 * EI); thB = thA; Mmax = q * L * L / 2; where = '自由端'; Mfix = -q * L * L / 2;
            break;
          case 'cb-m':
            label = '悬臂梁 · 自由端集中力偶 M₀'; if (!(M0 > 0)) return { msgs: [['err', '集中力偶需为正数']], rows: [] };
            fmax = M0 * L * L / (2 * EI); thA = M0 * L / EI; thB = thA; Mmax = M0; where = '自由端'; Mfix = -M0;
            break;
          case 'fx-c':
            label = '两端固定梁 · 跨中集中力 P'; if (!(P > 0)) return { msgs: [['err', '集中力需为正数']], rows: [] };
            fmax = P * L * L * L / (192 * EI); thA = 0; thB = 0; Mmid = P * L / 8; Mfix = -P * L / 8; Mmax = P * L / 8; where = '跨中';
            break;
          case 'fx-q':
            label = '两端固定梁 · 全跨均布载荷 q'; if (!(q > 0)) return { msgs: [['err', '均布载荷需为正数']], rows: [] };
            fmax = q * Math.pow(L, 4) / (384 * EI); thA = 0; thB = 0; Mmid = q * L * L / 24; Mfix = -q * L * L / 12; Mmax = q * L * L / 12; where = '跨中';
            break;
          default:
            return { msgs: [['err', '未知的支承与载荷组合']], rows: [] };
        }
        const fallow = L / rt;
        const okf = fmax <= fallow;
        const ratio = fmax / L;
        const msgs = [];
        msgs.push([okf ? 'ok' : 'err', label + '：最大挠度 f<sub>max</sub> = <b>' + f(fmax, 4) + ' mm</b>（位于' + where + '），' +
          '许用挠度 [f] = L/' + rt + ' = ' + f(fallow, 4) + ' mm —— <b>' + (okf ? '刚度合格' : '刚度不足') + '</b>' +
          (okf ? '，裕度 ' + f(fallow / fmax, 2) + ' 倍。' : '，需加大截面惯性矩 I 或缩短跨度 L。')]);
        if (ratio > 1 / 50) msgs.push(['warn', '挠跨比 ' + f(ratio, 4) + ' 已超过 1/50，小变形假设不成立，线性梁理论结果不可用，需按大变形或几何非线性另算。']);
        if (thA === 0 && thB === 0) msgs.push(['ok', '两端固定，支座处转角为 0（理想固支；实际支座总有转动，真实挠度会略大于此值）。']);
        return {
          msgs,
          rows: [
            ['载荷情况', label, ''],
            ['抗弯刚度 E·I', f(EI, 0), 'N·mm²'],
            ['最大挠度 f<sub>max</sub>', f(fmax, 5), 'mm', true],
            ['最大挠度出现位置', where, ''],
            ['挠跨比 f<sub>max</sub> / L', f(ratio, 6), '—'],
            ['支座 A 转角 θ<sub>A</sub>', f(thA * 180 / Math.PI, 5), '°'],
            ['支座 B 转角 θ<sub>B</sub>', f(thB * 180 / Math.PI, 5), '°'],
            ['支座 A 转角（弧度）', f(thA, 7), 'rad'],
            ['最大弯矩 M<sub>max</sub>', f(Mmax, 1), 'N·mm', true],
            ['最大弯矩处的弯曲正应力 σ = M/W', '需配合截面抗弯模量 W', ''],
            ['许用挠度 [f] = L/' + rt, f(fallow, 4), 'mm', true],
            ['挠度裕度 [f] / f<sub>max</sub>', f(fallow / fmax, 3), '—']
          ].concat(
            fload === null ? [] : [['载荷点挠度 f<sub>a</sub>', f(fload, 5), 'mm']]
          ).concat(
            Mfix === 0 ? [] : [['固端弯矩（绝对值）', f(Math.abs(Mfix), 1), 'N·mm', true]]
          ).concat(
            Mmid === 0 ? [] : [['跨中弯矩', f(Mmid, 1), 'N·mm', true]]
          )
        };
      }
    },

    /* ---------------- ⑧ 极限与配合计算 ---------------- */
    {
      id: 'tol',
      name: '极限与配合计算',
      desc: '按 GB/T 1800.1 查标准公差数值，再由孔与轴的基本偏差算出极限尺寸、间隙/过盈与配合性质。',
      inputs: [
        { k: 'L', label: '基本尺寸 L', unit: 'mm', def: 30 },
        { k: 'IT', label: '孔公差等级', sel: [['IT5', 'IT5'], ['IT6', 'IT6'], ['IT7', 'IT7'], ['IT8', 'IT8'],
            ['IT9', 'IT9'], ['IT10', 'IT10'], ['IT11', 'IT11'], ['IT12', 'IT12'], ['IT13', 'IT13'], ['IT14', 'IT14']], def: 'IT7' },
        { k: 'IT2', label: '轴公差等级（与孔相同时不用改）', sel: [['IT5', 'IT5'], ['IT6', 'IT6'], ['IT7', 'IT7'], ['IT8', 'IT8'],
            ['IT9', 'IT9'], ['IT10', 'IT10'], ['IT11', 'IT11'], ['IT12', 'IT12'], ['IT13', 'IT13'], ['IT14', 'IT14']], def: 'IT7' },
        { k: 'EI', label: '孔的基本偏差 EI（H 孔填 0）', unit: 'mm', def: 0 },
        { k: 'es', label: '轴的基本偏差 es（h 轴填 0）', unit: 'mm', def: -0.007 }
      ],
      note: '<b>标准公差数值</b>按 GB/T 1800.3 内置表格（基本尺寸 ≤500 mm、IT5~IT18），按基本尺寸所在尺寸段直接取值。' +
            '<br><b>基本偏差</b>（a…zc、A…ZC）本工具<b>未内置</b> —— 那两张表按尺寸段列出，凭印象枚举容易出错。' +
            '请查 GB/T 1800.1 表格把<b>孔的下偏差 EI</b> 与<b>轴的止偏差 es</b> 填进来，本页负责后面所有算术。' +
            '<br><b>填法口诀</b>：基孔制（常用）时孔用 H，<b>EI = 0</b>；基轴制时轴用 h，<b>es = 0</b>；' +
            '轴的基本偏差 es 对 a~h 为负值（间隙），对 k~zc 应是下偏差 ei（此时请把它换算成 es = ei + IT 再填）。' +
            '<br><b>配合性质判定</b>：最大间隙 X<sub>max</sub> = ES − ei，最小间隙 X<sub>min</sub> = EI − es。' +
            'X<sub>min</sub> ≥ 0 为间隙配合；X<sub>max</sub> ≤ 0 为过盈配合；两者之间为过渡配合。' +
            '<br><b>优先配合推荐</b>：H7/f6、H8/f7（转动配合，如轴瓦）、H7/g6（精密滑动、定位）、H7/h6（可拆卸定位）、' +
            'H7/js6、H7/k6（过渡，需定位又常拆）、H7/n6、H7/p6（过渡偏紧，少拆）、H7/r6、H7/s6、H7/u6（过盈，靠压力机或温差装配）。',
      run(v) {
        const R = [[3, 0], [6, 1], [10, 2], [18, 3], [30, 4], [50, 5], [80, 6], [120, 7], [180, 8], [250, 9], [315, 10], [400, 11], [500, 12]];
        const ITT = {
          IT5: [4, 5, 6, 8, 9, 11, 13, 15, 18, 20, 23, 25, 27],
          IT6: [6, 8, 9, 11, 13, 16, 19, 22, 25, 29, 32, 36, 40],
          IT7: [10, 12, 15, 18, 21, 25, 30, 35, 40, 46, 52, 57, 63],
          IT8: [14, 18, 22, 27, 33, 39, 46, 54, 63, 72, 81, 89, 97],
          IT9: [25, 30, 36, 43, 52, 62, 74, 87, 100, 115, 130, 140, 155],
          IT10: [40, 48, 58, 70, 84, 100, 120, 140, 160, 185, 210, 230, 250],
          IT11: [60, 75, 90, 110, 130, 160, 190, 220, 250, 290, 320, 360, 400],
          IT12: [100, 120, 150, 180, 210, 250, 300, 350, 400, 460, 520, 570, 630],
          IT13: [140, 180, 220, 270, 330, 390, 460, 540, 630, 720, 810, 890, 970],
          IT14: [250, 300, 360, 430, 520, 620, 740, 870, 1000, 1150, 1300, 1400, 1550],
          IT15: [400, 480, 580, 700, 840, 1000, 1200, 1400, 1600, 1850, 2100, 2300, 2500],
          IT16: [600, 750, 900, 1100, 1300, 1600, 1900, 2200, 2500, 2900, 3200, 3600, 4000],
          IT17: [1000, 1200, 1500, 1800, 2100, 2500, 3000, 3500, 4000, 4600, 5200, 5700, 6300],
          IT18: [1400, 1800, 2200, 2700, 3300, 3900, 4600, 5400, 6300, 7200, 8100, 8900, 9700]
        };
        const L = +v.L, EI = +v.EI, es = +v.es, gradeH = v.IT, gradeS = v.IT2 || v.IT;
        if (!(L > 0)) return { msgs: [['err', '基本尺寸需为正数']], rows: [] };
        if (!ITT[gradeH] || !ITT[gradeS]) return { msgs: [['err', '公差等级需在 IT5~IT18 之间']], rows: [] };
        if (L > 500) return { msgs: [['err', '本表覆盖基本尺寸 ≤ 500 mm；大于 500 mm 请查 GB/T 1800.3 大尺寸段（表中未收录）']], rows: [] };
        let idx = -1, lo = 0;
        for (let i = 0; i < R.length; i++) { if (L <= R[i][0]) { idx = R[i][1]; lo = i === 0 ? 0 : R[i - 1][0]; break; } }
        if (idx < 0) return { msgs: [['err', '基本尺寸超出表格范围']], rows: [] };
        const ITumH = ITT[gradeH][idx], ITumS = ITT[gradeS][idx];
        const ITH = ITumH / 1000, ITS = ITumS / 1000;
        const loTxt = lo === 0 ? '≤ 3' : (lo + ' &lt; L ≤ ' + R[idx][0]);

        const ES = EI + ITH;         // 孔
        const ei = es - ITS;         // 轴
        const Xmax = ES - ei, Xmin = EI - es;
        let kind, lvl;
        if (Xmin >= 0) { kind = '间隙配合'; lvl = 'ok'; }
        else if (Xmax <= 0) { kind = '过盈配合'; lvl = 'warn'; }
        else { kind = '过渡配合'; lvl = 'warn'; }
        const fm = function (x) { return (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(4); };
        const msgs = [];
        msgs.push(['ok', '基本尺寸 ' + L + ' mm 属于尺寸段 <b>' + loTxt + ' mm</b>：孔 ' + gradeH + ' 公差 IT = ' + ITumH +
          ' μm，轴 ' + gradeS + ' 公差 IT = ' + ITumS + ' μm。']);
        msgs.push([lvl, '配合性质：<b>' + kind + '</b>。' +
          (Xmin >= 0 ? '最小间隙 X<sub>min</sub> = ' + Xmin.toFixed(4) + ' mm，始终有间隙。'
            : (Xmax <= 0 ? '最小过盈 Y<sub>min</sub> = ' + Math.abs(Xmax).toFixed(4) + ' mm，始终是过盈，需压力机或温差装配。'
              : '可能间隙也可能过盈（X<sub>max</sub> = ' + Xmax.toFixed(4) + ' mm，X<sub>min</sub> = ' + Xmin.toFixed(4) + ' mm），适合定位但不宜频繁拆装。'))]);
        if (kind === '过盈配合') msgs.push(['warn', '过盈配合装配前请核算压入力与材料强度（用「过盈配合压入力与温差」工具），避免轮毂胀裂。']);
        return {
          msgs,
          rows: [
            ['基本尺寸 L', f(L, 3), 'mm'],
            ['所在尺寸段', loTxt, 'mm'],
            ['孔公差等级', gradeH, ''],
            ['轴公差等级', gradeS, ''],
            ['孔标准公差 IT', f(ITH, 4), 'mm'],
            ['孔标准公差 IT', f(ITumH, 0), 'μm'],
            ['轴标准公差 IT', f(ITS, 4), 'mm'],
            ['轴标准公差 IT', f(ITumS, 0), 'μm'],
            ['孔 · 下偏差 EI', fm(EI), 'mm'],
            ['孔 · 上偏差 ES = EI + IT<sub>孔</sub>', fm(ES), 'mm', true],
            ['孔 · 最大极限尺寸', f(L + ES, 4), 'mm'],
            ['孔 · 最小极限尺寸', f(L + EI, 4), 'mm'],
            ['孔 · 公差带', EI.toFixed(3) + ' ~ ' + ES.toFixed(3), 'mm'],
            ['轴 · 上偏差 es', fm(es), 'mm'],
            ['轴 · 下偏差 ei = es − IT<sub>轴</sub>', fm(ei), 'mm', true],
            ['轴 · 最大极限尺寸', f(L + es, 4), 'mm'],
            ['轴 · 最小极限尺寸', f(L + ei, 4), 'mm'],
            ['轴 · 公差带', ei.toFixed(3) + ' ~ ' + es.toFixed(3), 'mm'],
            ['最大间隙 X<sub>max</sub> = ES − ei', f(Xmax, 4), 'mm', true],
            ['最小间隙 X<sub>min</sub> = EI − es', f(Xmin, 4), 'mm', true],
            ['配合公差 T<sub>f</sub> = X<sub>max</sub> − X<sub>min</sub>', f(Xmax - Xmin, 4), 'mm'],
            ['配合公差验算 IT<sub>孔</sub> + IT<sub>轴</sub>', f(ITH + ITS, 4), 'mm'],
            ['配合性质', kind, '']
          ]
        };
      }
    },

    /* ---------------- ⑨ 过盈配合压入力与温差装配 ---------------- */
    {
      id: 'pressfit',
      name: '过盈配合压入力与温差装配',
      desc: '按厚壁圆筒（拉梅）公式算配合面压强、所需的压入力/压出力、可传递扭矩，以及温差法所需加热温度。',
      inputs: [
        { k: 'd', label: '配合直径 d', unit: 'mm', def: 100 },
        { k: 'd2', label: '轮毂外径 d₂（空心轴时也指轮毂）', unit: 'mm', def: 200 },
        { k: 'd1', label: '轴内径 d₁（实心轴填 0）', unit: 'mm', def: 0 },
        { k: 'delta', label: '过盈量 δ（直径上的）', unit: 'μm', def: 50 },
        { k: 'L', label: '配合长度 L', unit: 'mm', def: 80 },
        { k: 'E1', label: '轴材料弹性模量 E₁', unit: 'MPa', def: 206000 },
        { k: 'E2', label: '轮毂材料弹性模量 E₂', unit: 'MPa', def: 206000 },
        { k: 'nu1', label: '轴泊松比 μ₁', unit: '—', def: 0.3 },
        { k: 'nu2', label: '轮毂泊松比 μ₂', unit: '—', def: 0.3 },
        { k: 'mf', label: '配合面摩擦系数 f', unit: '—', def: 0.12 },
        { k: 'alpha', label: '轮毂线膨胀系数 α', unit: '1/°C', def: 0.0000115 }
      ],
      note: '<b>厚壁圆筒（拉梅）公式</b>：配合面压强' +
            '<br>&nbsp;&nbsp;<b>p = δ / [ d·( C₁/E₁ + C₂/E₂ ) ]</b>' +
            '<br>其中轴 <b>C₁ = (d² + d₁²)/(d² − d₁²) − μ₁</b>，实心轴 d₁ = 0 时退化为 <b>C₁ = 1 − μ₁</b>；' +
            '轮毂 <b>C₂ = (d₂² + d²)/(d₂² − d²) + μ₂</b>。' +
            '<br><b>压入力</b> F = π·d·L·p·f（把过盈面推合的轴向力，或压出时的分离力，两者大小相同）。' +
            '<br><b>可传递扭矩</b> T = π·d²·L·p·f / 2。' +
            '<br><b>温差法</b>：加热轮毂（或冷却轴）使直径变化量等于过盈量，所需温差 <b>ΔT = δ / (α·d)</b>；' +
            '实际装配温度还要在 ΔT 上加 20~40 ℃ 的装配余量。' +
            '<br><b>注意</b>：本页只算弹性范围。若算出的压强 p 使轮毂内表面等效应力超过材料屈服强度，' +
            '则装配时会塑性变形甚至胀裂 —— <b>务必用下面的等效应力一行核对</b>（按最大剪应力理论估算环向应力）。' +
            '另外算出的压入力若大到不现实，说明该过盈用压装不可行，应改温差法或换配合。',
      run(v) {
        const d = +v.d, d2 = +v.d2, d1 = +v.d1, delta = +v.delta, L = +v.L;
        const E1 = +v.E1, E2 = +v.E2, nu1 = +v.nu1, nu2 = +v.nu2, mf = +v.mf, alpha = +v.alpha;
        if (!(d > 0) || !(d2 > d) || !(L > 0)) return { msgs: [['err', '需满足 d > 0、轮毂外径 d₂ > d、配合长度 L > 0']], rows: [] };
        if (!(d1 >= 0) || d1 >= d) return { msgs: [['err', '轴内径 d₁ 需满足 0 ≤ d₁ < d']], rows: [] };
        if (!(delta > 0)) return { msgs: [['err', '过盈量需为正数']], rows: [] };
        if (!(E1 > 0) || !(E2 > 0)) return { msgs: [['err', '弹性模量需为正数']], rows: [] };
        if (!(mf > 0)) return { msgs: [['err', '摩擦系数需为正数']], rows: [] };
        const D = delta / 1000;                       // μm → mm
        const C1 = (d1 > 0) ? (d * d + d1 * d1) / (d * d - d1 * d1) - nu1 : 1 - nu1;
        const C2 = (d2 * d2 + d * d) / (d2 * d2 - d * d) + nu2;
        const comp = C1 / E1 + C2 / E2;
        const p = D / (d * comp);                     // MPa
        const Fpush = Math.PI * d * L * p * mf;       // N
        const T = Math.PI * d * d * L * p * mf / 2;   // N·mm
        const dT = D / (alpha * d);                   // °C
        // 轮毂内表面环向应力（受内压 p 的厚壁筒，内表面最大）
        const sigT = p * (d2 * d2 + d * d) / (d2 * d2 - d * d);
        const sigR = -p;
        const sigV = sigT - sigR;                     // 最大剪应力理论的等效应力（= sigT + p）
        const msgs = [];
        msgs.push(['ok', '配合面压强 <b>p = ' + f(p, 2) + ' MPa</b>；压入力 <b>F = ' + f(Fpush / 1000, 2) + ' kN</b>（≈ ' + f(Fpush / 9800, 2) + ' 吨力）。']);
        msgs.push(['ok', '可传递扭矩 T = ' + f(T / 1000, 1) + ' N·m（按摩擦传递，未计安全系数；联轴器等场合建议再除 1.5~2 的安全系数）。']);
        msgs.push(['ok', '温差法：使' + (alpha > 0 ? '轮毂' : '工件') + '直径变化 ' + delta + ' μm 需温差 <b>ΔT = ' + f(dT, 1) +
          ' ℃</b>，加上 20~40 ℃ 装配余量后建议加热到温升 ' + f(dT + 30, 1) + ' ℃ 以上。']);
        msgs.push([sigV > 355 ? 'err' : (sigV > 235 ? 'warn' : 'ok'), '轮毂内表面环向应力 <b>σ<sub>t</sub> = ' + f(sigT, 1) + ' MPa</b>，' +
          '按最大剪应力理论的等效应力 σ<sub>e</sub> = σ<sub>t</sub> − σ<sub>r</sub> = ' + f(sigV, 1) + ' MPa。' +
          (sigV > 355 ? '已超过一般<b>调质钢</b>的屈服强度（约 355 MPa），装配时轮毂有塑性变形或胀裂风险，必须降低过盈量或改用其他联接方式。'
            : (sigV > 235 ? '已接近/超过一般<b>碳素结构钢</b>屈服强度（约 235 MPa），请按轮毂实际材料的 σ<sub>s</sub> 核对。'
              : '低于常用钢材屈服强度，弹性范围内安全。'))]);
        return {
          msgs,
          rows: [
            ['配合直径 d', f(d, 2), 'mm'],
            ['直径过盈量 δ', f(delta, 1), 'μm'],
            ['轴系数 C₁', f(C1, 4), '—', true],
            ['轮毂系数 C₂', f(C2, 4), '—', true],
            ['柔度项 C₁/E₁ + C₂/E₂', (comp).toExponential(4), 'mm²/N'],
            ['配合面压强 p', f(p, 3), 'MPa', true],
            ['压入力 / 分离力 F', f(Fpush, 0), 'N', true],
            ['压入力（吨力）', f(Fpush / 9800, 3), 'tf'],
            ['可传递扭矩 T', f(T, 0), 'N·mm', true],
            ['可传递扭矩（除以 2 安全系数）', f(T / 2000, 1), 'N·m'],
            ['可传递轴向力（摩擦）', f(Math.PI * d * L * p * mf, 0), 'N'],
            ['温差法所需温差 ΔT', f(dT, 2), '℃', true],
            ['建议加热温升（ΔT + 30）', f(dT + 30, 1), '℃'],
            ['轮毂内表面环向应力 σ<sub>t</sub>', f(sigT, 2), 'MPa', true],
            ['轮毂内表面径向应力 σ<sub>r</sub>', f(sigR, 2), 'MPa'],
            ['等效应力 σ<sub>e</sub>(最大剪应力理论)', f(sigV, 2), 'MPa', true],
            ['轮毂外径与配合直径之比 d₂/d', f(d2 / d, 3), '—']
          ]
        };
      }
    },

    /* ---------------- ⑩ 压杆稳定校核 ---------------- */
    {
      id: 'column',
      name: '压杆稳定校核（欧拉公式）',
      desc: '算柔度 λ 与临界柔度 λp，判断欧拉公式是否适用，并给出临界力、临界应力与稳定安全系数。',
      inputs: [
        { k: 'mu', label: '长度系数 μ', sel: [['0.5', '两端固定  μ = 0.5'], ['0.7', '一端固定、一端铰支  μ = 0.7'],
            ['1', '两端铰支  μ = 1.0'], ['2', '一端固定、一端自由  μ = 2.0']], def: '1' },
        { k: 'L', label: '杆长 L', unit: 'mm', def: 1000 },
        { k: 'E', label: '弹性模量 E', unit: 'MPa', def: 206000 },
        { k: 'I', label: '最小惯性矩 I<sub>min</sub>', unit: 'mm⁴', def: 100000 },
        { k: 'A', label: '横截面积 A', unit: 'mm²', def: 800 },
        { k: 'sp', label: '材料的比例极限 σ<sub>p</sub>', unit: 'MPa', def: 200 },
        { k: 'F', label: '实际工作压力 F', unit: 'N', def: 50000 },
        { k: 'nst', label: '规定的稳定安全系数 [n]<sub>st</sub>', unit: '—', def: 3 }
      ],
      note: '<b>临界柔度</b> λ<sub>p</sub> = π·√(E/σ<sub>p</sub>)，σ<sub>p</sub> 为材料的比例极限（Q235 取约 200 MPa，合金钢可更高）。' +
            '<br><b>柔度</b> λ = μ·L / i，其中 i = √(I<sub>min</sub>/A) 为截面最小惯性半径。' +
            '<br><b>欧拉公式（仅当 λ ≥ λ<sub>p</sub> 时适用）</b>：F<sub>cr</sub> = π²EI<sub>min</sub> / (μL)²，σ<sub>cr</sub> = π²E / λ²。' +
            '<br><b>为什么必须判 λ</b>：λ &lt; λ<sub>p</sub> 时杆属于中柔度或小柔度压杆，欧拉公式会给出<b>偏大</b>的临界力，' +
            '结果偏危险。工程上用折减系数法（φ 表）或经验公式处理，<b>本页不覆盖那种情况</b>，只会明确提示你。' +
            '<br>I 要取截面<b>最小</b>惯性矩对应的方向 —— 压杆总是朝最弱的方向失稳。' +
            '<br>稳定安全系数 [n]<sub>st</sub> 常取：钢材 1.8~3.0、铸铁 4.5~5.5、木 2.5~3.5。',
      run(v) {
        const mu = +v.mu, L = +v.L, E = +v.E, I = +v.I, A = +v.A, sp = +v.sp, F = +v.F, nst = +v.nst;
        if (!(mu > 0) || !(L > 0) || !(E > 0) || !(I > 0) || !(A > 0)) return { msgs: [['err', '长度系数、杆长、弹性模量、惯性矩、截面积需为正数']], rows: [] };
        if (!(sp > 0)) return { msgs: [['err', '比例极限需为正数']], rows: [] };
        if (!(nst > 0)) return { msgs: [['err', '稳定安全系数需为正数']], rows: [] };
        const i = Math.sqrt(I / A);
        const lam = mu * L / i;
        const lamp = Math.PI * Math.sqrt(E / sp);
        const EulerOK = lam >= lamp;
        const Fcr = Math.PI * Math.PI * E * I / Math.pow(mu * L, 2);
        const scr = Math.PI * Math.PI * E / (lam * lam);
        const nreal = F > 0 ? Fcr / F : Infinity;
        const msgs = [];
        if (EulerOK) {
          msgs.push(['ok', '柔度 λ = ' + f(lam, 1) + ' ≥ λ<sub>p</sub> = ' + f(lamp, 1) + '，属<b>大柔度压杆</b>，欧拉公式适用。']);
          msgs.push([nreal >= nst ? 'ok' : 'err', '临界力 F<sub>cr</sub> = ' + f(Fcr / 1000, 2) + ' kN（临界应力 σ<sub>cr</sub> = ' + f(scr, 1) +
            ' MPa）。实际工作压力 F = ' + f(F / 1000, 2) + ' kN，稳定安全系数 <b>n = ' + (isFinite(nreal) ? f(nreal, 3) : '∞') +
            '</b> ' + (nreal >= nst ? '≥' : '&lt;') + ' [n]<sub>st</sub> = ' + f(nst, 2) + ' —— <b>' +
            (nreal >= nst ? '稳定性合格' : '稳定性不足') + '</b>。']);
          if (nreal > 0 && isFinite(nreal)) msgs.push(['ok', '按当前安全系数要求，允许的最大工作压力 [F] = F<sub>cr</sub>/[n]<sub>st</sub> = ' + f(Fcr / nst / 1000, 2) + ' kN。']);
        } else {
          msgs.push(['err', '柔度 λ = ' + f(lam, 1) + ' &lt; λ<sub>p</sub> = ' + f(lamp, 1) + '，属<b>中/小柔度压杆</b>，' +
            '<b>欧拉公式不适用</b>（会明显高估临界力）。']);
          msgs.push(['warn', '请改用折减系数法：σ = F/A ≤ φ·[σ]，φ 按材料与 λ 查表（GB 50017 或材料力学教材附录）。' +
            '本页仍列出欧拉公式的结果供参考，但<b>不要用它做合格判定</b>。']);
          msgs.push(['warn', '欧拉公式参考值：F<sub>cr</sub> = ' + f(Fcr / 1000, 2) + ' kN、σ<sub>cr</sub> = ' + f(scr, 1) + ' MPa —— 该值是偏大的乐观估计。']);
        }
        if (lam < 20) msgs.push(['warn', 'λ &lt; 20，应按<b>强度</b>问题处理（σ = F/A 与屈服强度比较），而不是稳定问题。']);
        return {
          msgs,
          rows: [
            ['长度系数 μ', f(mu, 2), '—'],
            ['杆长 L', f(L, 1), 'mm'],
            ['计算长度 μL', f(mu * L, 1), 'mm'],
            ['截面惯性半径 i = √(I/A)', f(i, 4), 'mm', true],
            ['柔度 λ = μL/i', f(lam, 2), '—', true],
            ['临界柔度 λ<sub>p</sub> = π√(E/σ<sub>p</sub>)', f(lamp, 2), '—', true],
            ['λ 与 λ<sub>p</sub> 关系', EulerOK ? 'λ ≥ λp（欧拉适用）' : 'λ < λp（欧拉不适用）', '', true],
            ['临界力 F<sub>cr</sub> = π²EI/(μL)²', f(Fcr, 0), 'N', true],
            ['临界应力 σ<sub>cr</sub> = π²E/λ²', f(scr, 2), 'MPa', true],
            ['实际工作压力 F', f(F, 0), 'N'],
            ['工作压应力 σ = F/A', f(F / A, 2), 'MPa'],
            ['稳定安全系数 n = F<sub>cr</sub>/F', isFinite(nreal) ? f(nreal, 3) : '∞', '—', true],
            ['规定安全系数 [n]<sub>st</sub>', f(nst, 2), '—'],
            ['允许的最大工作压力 [F]', isFinite(nreal) ? f(Fcr / nst, 0) : '—', 'N']
          ]
        };
      }
    },

    /* ============================================================
       以下 5 个工具原先是独立页面（gear.html / drive.html）的私有逻辑。
       为支持离线单文件版，改造为声明式工具，渲染路径与上面 10 个完全一致。
       数值公式一字未改，直接调用 lib.js 的 MG.gearPair / MG.gearProfile /
       MG.beltDrive / MG.shaftCheck / MG.bearingLife。
       齿轮齿形预览通过 run() 返回的 html 字段输出（calc.html 已支持该字段）。
       ============================================================ */

    /* ---------------- ⑪ 渐开线齿轮几何参数（原 gear.html） ---------------- */
    {
      id: 'gear',
      name: '渐开线齿轮几何参数',
      desc: '标准直齿圆柱齿轮（外啮合，标准齿，x=0）的分度圆、齿顶圆、齿根圆、基圆、齿顶厚与端面重合度，含根切/齿顶变尖校验与 1:1 齿形预览。',
      inputs: [
        { k: 'm', label: '模数 m', unit: 'mm', def: 3 },
        { k: 'z1', label: '小齿轮齿数 z₁', unit: '—', def: 20 },
        { k: 'z2', label: '大齿轮齿数 z₂', unit: '—', def: 60 },
        { k: 'alphaDeg', label: '压力角 α', unit: '°', def: 20 },
        { k: 'b', label: '齿宽 b（可选）', unit: 'mm', def: 30 }
      ],
      note: 'd = mz&nbsp;&nbsp;|&nbsp;&nbsp;d<sub>b</sub> = d·cosα&nbsp;&nbsp;|&nbsp;&nbsp;d<sub>a</sub> = d + 2h<sub>a</sub>*m&nbsp;&nbsp;|&nbsp;&nbsp;d<sub>f</sub> = d − 2(h<sub>a</sub>*+c*)m' +
            '<br>p = πm&nbsp;&nbsp;|&nbsp;&nbsp;s = πm/2&nbsp;&nbsp;|&nbsp;&nbsp;a = m(z₁+z₂)/2&nbsp;&nbsp;|&nbsp;&nbsp;i = z₂/z₁&nbsp;&nbsp;|&nbsp;&nbsp;inv α = tanα − α' +
            '<br>s<sub>a</sub> = d<sub>a</sub>·[ s/d + inv α − inv α<sub>a</sub> ]&nbsp;&nbsp;（齿顶厚，防变尖）' +
            '<br>ε<sub>α</sub> = [ z₁(tanα<sub>a1</sub> − tanα) + z₂(tanα<sub>a2</sub> − tanα) ] / 2π&nbsp;&nbsp;（必须 &gt; 1）' +
            '<br>z<sub>min</sub> = 2h<sub>a</sub>* / sin²α&nbsp;&nbsp;（20° 标准齿为 17）' +
            '<br>默认 h<sub>a</sub>* = 1、c* = 0.25。齿形预览按小齿轮 z₁ 绘制（1:1 比例示意，含齿根过渡圆角 ρ = 0.38m）。',
      run(v) {
        const o = { m: v.m, z1: v.z1, z2: v.z2, alphaDeg: v.alphaDeg };
        const r = MG.gearPair(o);
        if (r.error) return { msgs: [['err', r.error]], rows: [], html: '' };

        const msgs = [];
        if (r.eps > 1.2) msgs.push(['ok', '端面重合度 ε<sub>α</sub> = ' + f(r.eps, 3) + '，传动平稳性良好（&gt;1.2）。']);
        else if (r.eps > 1.0) msgs.push(['warn', '端面重合度 ε<sub>α</sub> = ' + f(r.eps, 3) + '，仅略大于 1，传动连续性勉强满足，建议增大齿数或调整压力角。']);
        else msgs.push(['err', '端面重合度 ε<sub>α</sub> = ' + f(r.eps, 3) + ' ≤ 1，<b>传动不连续</b>，啮合会中断，必须重新设计。']);
        if (r.undercut1) msgs.push(['err', 'z₁ = ' + r.z1 + ' &lt; z<sub>min</sub> = ' + f(r.zmin, 2) + '，小齿轮会发生<b>根切</b>，须采用变位齿轮或增大齿数。']);
        if (r.undercut2) msgs.push(['err', 'z₂ = ' + r.z2 + ' &lt; z<sub>min</sub> = ' + f(r.zmin, 2) + '，大齿轮会发生<b>根切</b>。']);
        if (r.sharp1) msgs.push(['warn', '小齿轮齿顶厚 s<sub>a1</sub> = ' + f(r.sa1) + ' mm &lt; 0.25m，齿顶过尖，承载能力差。']);
        if (r.sharp2) msgs.push(['warn', '大齿轮齿顶厚 s<sub>a2</sub> = ' + f(r.sa2) + ' mm &lt; 0.25m，齿顶过尖。']);
        if (!r.undercut1 && !r.undercut2 && !r.sharp1 && !r.sharp2 && r.eps > 1.2)
          msgs.push(['ok', '未发现根切或齿顶变尖问题，几何参数合理。']);

        const b = +v.b;
        const rows = [
          ['分度圆直径 d₁ / d₂', f(r.d1) + ' / ' + f(r.d2), 'mm', true],
          ['齿顶圆直径 d<sub>a1</sub> / d<sub>a2</sub>', f(r.da1) + ' / ' + f(r.da2), 'mm', true],
          ['齿根圆直径 d<sub>f1</sub> / d<sub>f2</sub>', f(r.df1) + ' / ' + f(r.df2), 'mm'],
          ['基圆直径 d<sub>b1</sub> / d<sub>b2</sub>', f(r.db1) + ' / ' + f(r.db2), 'mm'],
          ['齿顶高 h<sub>a</sub>', f(r.ha1), 'mm'],
          ['齿根高 h<sub>f</sub>', f(r.hf1), 'mm'],
          ['全齿高 h', f(r.h1), 'mm'],
          ['齿距 p', f(r.p), 'mm'],
          ['分度圆齿厚 s', f(r.s), 'mm'],
          ['标准中心距 a', f(r.a), 'mm', true],
          ['传动比 i = z₂/z₁', f(r.i, 4), '—', true],
          ['齿顶圆压力角 α<sub>a1</sub> / α<sub>a2</sub>', f(r.aa1, 3) + '° / ' + f(r.aa2, 3) + '°', '°'],
          ['端面重合度 ε<sub>α</sub>', f(r.eps, 4), '—', true],
          ['齿顶厚 s<sub>a1</sub> / s<sub>a2</sub>', f(r.sa1) + ' / ' + f(r.sa2), 'mm', true],
          ['齿顶厚下限 0.25m', f(0.25 * r.m), 'mm'],
          ['不根切最少齿数 z<sub>min</sub>', f(r.zmin, 2), '—'],
          ['小齿轮每转啮合齿数（近似）', f(r.eps, 2), '对']
        ];
        if (b > 0) {
          rows.push(['齿宽 b₁ / b₂（建议 b₂=b, b₁=b+5）', f(b) + ' / ' + f(b + 5), 'mm']);
          rows.push(['齿宽系数 φ<sub>d</sub> = b/d₁', f(b / r.d1, 3), '—']);
        }
        return { msgs, rows, html: MG.gearSvg ? MG.gearSvg(o) : '' };
      }
    },

    /* ---------------- ⑫ 传动比分配（原 drive.html ①） ---------------- */
    {
      id: 'ratio',
      name: '传动比分配（展开式齿轮减速器）',
      desc: '按展开式圆柱齿轮减速器的常用分配规则反算各级传动比：两级取 i₁ ≈ 1.35·i₂，三级取 i₁ ≈ i₂ ≈ 1.4·i₃。',
      inputs: [
        { k: 'i', label: '总传动比 i<sub>总</sub>', unit: '—', def: 16 },
        { k: 'k', label: '传动级数', sel: [['2', '两级'], ['3', '三级']], def: '2' }
      ],
      note: '规则：展开式两级取 <b>i₁ ≈ 1.35·i₂</b>（高速级略大，使两级大齿轮浸油深度接近）；三级取 <b>i₁ ≈ i₂ ≈ 1.4·i₃</b>。' +
            '<br>两级：i₂ = √(i/1.35)，i₁ = i/i₂。三级：i₃ = ∛(i/1.96)，i₂ = 1.4·i₃，i₁ = i/(i₂·i₃)。' +
            '<br>这些是课程设计与手册里的经验分配区间，实际设计还要受齿轮强度、浸油深度、外廓尺寸约束，须迭代调整。',
      run(v) {
        const i = +v.i, k = +v.k;
        if (!(i > 1)) return { msgs: [['err', '总传动比需大于 1']], rows: [] };
        let ls = [], note = '';
        if (k === 2) {
          const i2 = Math.sqrt(i / 1.35), i1 = i / i2;
          ls = [['高速级 i₁', i1], ['低速级 i₂', i2]];
          note = '两级比 i₁/i₂ = ' + f(i1 / i2, 3) + '（推荐 1.3~1.4）';
        } else {
          const i3 = Math.cbrt(i / 1.96), i2 = 1.4 * i3, i1 = i / (i2 * i3);
          ls = [['高速级 i₁', i1], ['中间级 i₂', i2], ['低速级 i₃', i3]];
          note = 'i₁/i₂ = ' + f(i1 / i2, 3) + '，i₂/i₃ = ' + f(i2 / i3, 3);
        }
        const rows = ls.map((x, idx) => [x[0], f(x[1], 4), '—', idx === 0]);
        rows.push(['校验：各级相乘', f(ls.reduce((a, b) => a * b[1], 1), 4), '—', true]);
        rows.push(['分配说明', note, '']);
        return { msgs: [['ok', '总传动比 i = ' + f(i, 4) + ' 已按' + (k === 2 ? '两级' : '三级') + '展开式规则分配。']], rows };
      }
    },

    /* ---------------- ⑬ V 带传动（原 drive.html ②） ---------------- */
    {
      id: 'belt',
      name: 'V 带传动',
      desc: '计算功率、带速、初定中心距、所需基准带长与小轮包角，并给出带速与包角预警。',
      inputs: [
        { k: 'power', label: '传递功率 P', unit: 'kW', def: 4 },
        { k: 'n1', label: '小轮转速 n₁', unit: 'r/min', def: 1440 },
        { k: 'dd1', label: '小轮基准直径 d<sub>d1</sub>', unit: 'mm', def: 100 },
        { k: 'ratio', label: '传动比 i', unit: '—', def: 3 },
        { k: 'ka', label: '工况系数 K<sub>A</sub>', unit: '—', def: 1.2 }
      ],
      note: 'P<sub>ca</sub> = K<sub>A</sub>·P&nbsp;&nbsp;|&nbsp;&nbsp;d<sub>d2</sub> = i·d<sub>d1</sub>（取整）&nbsp;&nbsp;|&nbsp;&nbsp;v = πd<sub>d1</sub>n₁/60000' +
            '<br>中心距初选 a₀ = (0.7~2)(d<sub>d1</sub>+d<sub>d2</sub>)，本页取区间中值。' +
            '<br>所需基准带长 L<sub>d0</sub> = 2a₀ + π(d<sub>d1</sub>+d<sub>d2</sub>)/2 + (d<sub>d2</sub>−d<sub>d1</sub>)²/(4a₀)' +
            '<br>小轮包角 α₁ = 180° − (d<sub>d2</sub>−d<sub>d1</sub>)/a·57.3°&nbsp;&nbsp;（须 ≥ 120°）' +
            '<br><b>注意</b>：本页给出的 L<sub>d0</sub> 是<b>计算值</b>，须据此查 GB/T 11544 取最接近的<b>标准基准长度</b>，再回代求实际中心距；' +
            '带速推荐 5~25 m/s。本页不查单根带额定功率表，故不给出所需根数。',
      run(v) {
        const r = MG.beltDrive({ power: v.power, n1: v.n1, dd1: v.dd1, ratio: v.ratio, ka: v.ka });
        if (r.error) return { msgs: [['err', r.error]], rows: [] };
        const msgs = [];
        if (r.warn_v) msgs.push(['warn', r.warn_v]);
        if (r.warn_a) msgs.push(['warn', r.warn_a]);
        if (!r.warn_v && !r.warn_a) msgs.push(['ok', '带速与包角均在设计推荐范围内。']);
        return {
          msgs,
          rows: [
            ['计算功率 P<sub>ca</sub> = K<sub>A</sub>·P', f(r.Pd), 'kW', true],
            ['大轮基准直径 d<sub>d2</sub>（取整）', f(r.dd2, 0), 'mm', true],
            ['带速 v = πd<sub>d1</sub>n₁/60000', f(r.v), 'm/s', true],
            ['中心距初选范围', f(r.a0min) + ' ~ ' + f(r.a0max), 'mm'],
            ['初定中心距 a₀', f(r.a0), 'mm'],
            ['所需基准带长 L<sub>d0</sub>（须查标准带长）', f(r.Ld0), 'mm', true],
            ['小轮包角 α₁ = 180°−(d<sub>d2</sub>−d<sub>d1</sub>)/a·57.3°', f(r.alpha1), '°', true],
            ['推荐带速范围', '5 ~ 25', 'm/s'],
            ['包角下限', '120', '°']
          ]
        };
      }
    },

    /* ---------------- ⑭ 轴 · 弯扭合成强度校核（原 drive.html ③） ---------------- */
    {
      id: 'shaft',
      name: '轴 · 弯扭合成强度校核',
      desc: '第三强度理论：抗弯/抗扭截面系数、当量弯矩 M<sub>ca</sub>、计算应力、安全裕度与最小轴径。',
      inputs: [
        { k: 'M', label: '危险截面弯矩 M', unit: 'N·m', def: 180 },
        { k: 'T', label: '扭矩 T', unit: 'N·m', def: 250 },
        { k: 'd', label: '轴径 d', unit: 'mm', def: 35 },
        { k: 'sigma', label: '许用应力 [σ]', unit: 'MPa', def: 60 },
        { k: 'alpha', label: '折合系数 α', sel: [['0.3', '0.3（转矩脉动，如带传动输入轴）'],
            ['0.6', '0.6（转矩变化，一般减速器轴）'], ['1', '1.0（转矩频繁正反转）']], def: '0.6' }
      ],
      note: 'W = πd³/32&nbsp;&nbsp;|&nbsp;&nbsp;W<sub>T</sub> = πd³/16&nbsp;&nbsp;|&nbsp;&nbsp;M<sub>ca</sub> = √(M² + (αT)²)' +
            '<br>σ<sub>ca</sub> = M<sub>ca</sub>/W ≤ [σ]&nbsp;&nbsp;|&nbsp;&nbsp;反算最小直径 d<sub>min</sub> = ∛(32·M<sub>ca</sub>/(π[σ]))' +
            '<br><b>折合系数 α</b>（按扭转切应力的循环特性折算）：稳定转矩 α = 0.3；脉动转矩取 0.6；频繁正反转取 1.0。' +
            '<br><b>注意</b>：本页是<b>弯扭合成</b>，弯矩与扭矩需取自同一危险截面；键槽削弱、应力集中、尺寸系数等未计入，' +
            '正式设计须乘相应系数或按疲劳强度精确校核。',
      run(v) {
        const r = MG.shaftCheck({ M: +v.M * 1000, T: +v.T * 1000, d: v.d, sigma: v.sigma, alpha: v.alpha });
        if (r.error) return { msgs: [['err', r.error]], rows: [] };
        const sg = +v.sigma;
        return {
          msgs: [[r.pass ? 'ok' : 'err',
            'σ<sub>ca</sub> = ' + f(r.sCa) + ' MPa ' + (r.pass ? '≤' : '&gt;') + ' [σ] = ' + f(sg, 0) + ' MPa —— <b>' +
            (r.pass ? '强度合格' : '强度不足') + '</b>' + (r.pass
              ? '，裕度 ' + f(r.n, 2) + ' 倍。'
              : '，轴径至少需 ' + f(r.dmin, 1) + ' mm。')]],
          rows: [
            ['抗弯截面系数 W = πd³/32', f(r.W, 1), 'mm³'],
            ['抗扭截面系数 W<sub>T</sub> = πd³/16', f(r.WT, 1), 'mm³'],
            ['当量弯矩 M<sub>ca</sub> = √(M² + (αT)²)', f(r.Mca / 1000, 2), 'N·m', true],
            ['弯曲应力 σ<sub>b</sub> = M/W', f(r.sBend), 'MPa'],
            ['扭转应力 τ<sub>T</sub> = T/W<sub>T</sub>', f(r.sTor), 'MPa'],
            ['计算应力 σ<sub>ca</sub> = M<sub>ca</sub>/W', f(r.sCa), 'MPa', true],
            ['安全裕度 [σ]/σ<sub>ca</sub>', f(r.n, 3), '—', true],
            ['按 [σ] 反算最小轴径 d<sub>min</sub>', f(r.dmin, 2), 'mm', true]
          ]
        };
      }
    },

    /* ---------------- ⑮ 滚动轴承寿命（原 drive.html ④） ---------------- */
    {
      id: 'bearing',
      name: '滚动轴承基本额定寿命 L₁₀',
      desc: '基本额定寿命 (C/P)^ε · 10⁶/(60n) 小时，可设目标寿命自动判定是否合格。',
      inputs: [
        { k: 'C', label: '基本额定动载荷 C', unit: 'kN', def: 31.5 },
        { k: 'P', label: '当量动载荷 P', unit: 'kN', def: 4.2 },
        { k: 'n', label: '转速 n', unit: 'r/min', def: 420 },
        { k: 'epsilon', label: '寿命指数 ε', sel: [['3', '3（球轴承）'], ['3.3333', '10/3（滚子轴承）']], def: '3' },
        { k: 'need', label: '目标寿命要求', unit: 'h', def: 20000 }
      ],
      note: 'L<sub>10</sub> = (C/P)<sup>ε</sup> · 10<sup>6</sup> / (60n) &nbsp;小时&nbsp;&nbsp;|&nbsp;&nbsp;寿命指数 ε：球轴承 3，滚子轴承 10/3。' +
            '<br><b>注意</b>：这是<b>基本额定寿命</b>，可靠度 90%。实际选型还要引入温度系数 f<sub>t</sub>、载荷系数 f<sub>p</sub>，' +
            '以及对可靠度/材料/润滑修正的 a₁·a₂·a₃（或按 GB/T 6391 修正寿命公式）；高温、冲击、污染工况下实际寿命会明显低于此值。',
      run(v) {
        const r = MG.bearingLife({ C: v.C, P: v.P, n: v.n, epsilon: v.epsilon, need: v.need });
        if (r.error) return { msgs: [['err', r.error]], rows: [] };
        const need = +v.need;
        return {
          msgs: [[r.pass ? 'ok' : 'err', 'L₁₀ = ' + f(r.hours, 0) + ' h ' + (r.pass ? '≥' : '&lt;') + ' 目标 ' +
            f(need, 0) + ' h —— <b>' + (r.pass ? '寿命合格' : '寿命不足') + '</b>' +
            (r.pass ? '。' : '，需选更大 C 的轴承或降低当量动载荷。')]],
          rows: [
            ['载荷比 C/P', f(r.ratio, 3), '—', true],
            ['寿命系数 (C/P)<sup>ε</sup>', f(r.L10m, 1), '百万转', true],
            ['额定寿命 L₁₀', f(r.hours, 0), 'h', true],
            ['折算年限（按 8 h/天、250 天/年）', f(r.hours / (8 * 250), 2), '年'],
            ['目标寿命要求', f(need, 0), 'h']
          ]
        };
      }
    }

  ];
})();
