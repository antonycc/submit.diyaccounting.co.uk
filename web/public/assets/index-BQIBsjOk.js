(function () {
  const t = document.createElement("link").relList;
  if (t && t.supports && t.supports("modulepreload")) return;
  for (const s of document.querySelectorAll('link[rel="modulepreload"]')) r(s);
  new MutationObserver((s) => {
    for (const i of s) if (i.type === "childList") for (const a of i.addedNodes) a.tagName === "LINK" && a.rel === "modulepreload" && r(a);
  }).observe(document, { childList: !0, subtree: !0 });
  function n(s) {
    const i = {};
    return (
      s.integrity && (i.integrity = s.integrity),
      s.referrerPolicy && (i.referrerPolicy = s.referrerPolicy),
      s.crossOrigin === "use-credentials"
        ? (i.credentials = "include")
        : s.crossOrigin === "anonymous"
          ? (i.credentials = "omit")
          : (i.credentials = "same-origin"),
      i
    );
  }
  function r(s) {
    if (s.ep) return;
    s.ep = !0;
    const i = n(s);
    fetch(s.href, i);
  }
})();
const br = "5";
typeof window < "u" && ((window.__svelte ??= {}).v ??= new Set()).add(br);
let Ze = !1,
  wr = !1;
function yr() {
  Ze = !0;
}
yr();
const kr = 1,
  Er = 2,
  Tr = 16,
  Sr = 1,
  Ar = 2,
  xr = 4,
  Or = 8,
  Rr = 16,
  Ir = 1,
  $r = 2,
  Y = Symbol(),
  Cr = "http://www.w3.org/1999/xhtml",
  Bt = !1;
var St = Array.isArray,
  Nr = Array.prototype.indexOf,
  Xt = Array.from,
  Nn = Object.defineProperty,
  Ke = Object.getOwnPropertyDescriptor,
  Pn = Object.getOwnPropertyDescriptors,
  Pr = Object.prototype,
  Lr = Array.prototype,
  Zt = Object.getPrototypeOf;
function tt(e) {
  return typeof e == "function";
}
const Oe = () => {};
function Mr(e) {
  return e();
}
function gt(e) {
  for (var t = 0; t < e.length; t++) e[t]();
}
function Ln() {
  var e,
    t,
    n = new Promise((r, s) => {
      ((e = r), (t = s));
    });
  return { promise: n, resolve: e, reject: t };
}
const V = 2,
  Qt = 4,
  At = 8,
  Dr = 1 << 24,
  ge = 16,
  me = 32,
  Qe = 64,
  en = 128,
  ne = 512,
  B = 1024,
  G = 2048,
  re = 4096,
  X = 8192,
  ce = 16384,
  tn = 32768,
  We = 65536,
  pn = 1 << 17,
  Mn = 1 << 18,
  xt = 1 << 19,
  Dn = 1 << 20,
  Ae = 1 << 25,
  Fe = 32768,
  jt = 1 << 21,
  nn = 1 << 22,
  Re = 1 << 23,
  Me = Symbol("$state"),
  qn = Symbol("legacy props"),
  ze = new (class extends Error {
    name = "StaleReactionError";
    message = "The reaction that called `getAbortSignal()` was re-run or destroyed";
  })();
function Ot(e) {
  throw new Error("https://svelte.dev/e/lifecycle_outside_component");
}
function qr() {
  throw new Error("https://svelte.dev/e/async_derived_orphan");
}
function Fr(e) {
  throw new Error("https://svelte.dev/e/effect_in_teardown");
}
function Br() {
  throw new Error("https://svelte.dev/e/effect_in_unowned_derived");
}
function jr(e) {
  throw new Error("https://svelte.dev/e/effect_orphan");
}
function Ur() {
  throw new Error("https://svelte.dev/e/effect_update_depth_exceeded");
}
function Vr(e) {
  throw new Error("https://svelte.dev/e/lifecycle_legacy_only");
}
function Hr(e) {
  throw new Error("https://svelte.dev/e/props_invalid_value");
}
function Yr() {
  throw new Error("https://svelte.dev/e/state_descriptors_fixed");
}
function zr() {
  throw new Error("https://svelte.dev/e/state_prototype_fixed");
}
function Jr() {
  throw new Error("https://svelte.dev/e/state_unsafe_mutation");
}
function Fn(e) {
  return e === this.v;
}
function Bn(e, t) {
  return e != e ? t == t : e !== t || (e !== null && typeof e == "object") || typeof e == "function";
}
function jn(e) {
  return !Bn(e, this.v);
}
let P = null;
function mt(e) {
  P = e;
}
function Ce(e, t = !1, n) {
  P = { p: P, i: !1, c: null, e: null, s: e, x: null, l: Ze && !t ? { s: null, u: null, $: [] } : null };
}
function Ne(e) {
  var t = P,
    n = t.e;
  if (n !== null) {
    t.e = null;
    for (var r of n) Qn(r);
  }
  return ((t.i = !0), (P = t.p), {});
}
function ut() {
  return !Ze || (P !== null && P.l === null);
}
let Le = [];
function Un() {
  var e = Le;
  ((Le = []), gt(e));
}
function Vn(e) {
  if (Le.length === 0 && !rt) {
    var t = Le;
    queueMicrotask(() => {
      t === Le && Un();
    });
  }
  Le.push(e);
}
function Kr() {
  for (; Le.length > 0; ) Un();
}
function Gr(e) {
  var t = N;
  if (t === null) return (($.f |= Re), e);
  if ((t.f & tn) === 0) {
    if ((t.f & en) === 0) throw e;
    t.b.error(e);
  } else bt(e, t);
}
function bt(e, t) {
  for (; t !== null; ) {
    if ((t.f & en) !== 0)
      try {
        t.b.error(e);
        return;
      } catch (n) {
        e = n;
      }
    t = t.parent;
  }
  throw e;
}
const ht = new Set();
let L = null,
  ee = null,
  Q = [],
  Rt = null,
  Ut = !1,
  rt = !1;
class st {
  committed = !1;
  current = new Map();
  previous = new Map();
  #t = new Set();
  #n = new Set();
  #e = 0;
  #r = 0;
  #i = null;
  #s = new Set();
  #o = new Set();
  skipped_effects = new Set();
  is_fork = !1;
  is_deferred() {
    return this.is_fork || this.#r > 0;
  }
  process(t) {
    ((Q = []), this.apply());
    var n = { parent: null, effect: null, effects: [], render_effects: [] };
    for (const r of t) this.#l(r, n);
    (this.is_fork || this.#f(),
      this.is_deferred()
        ? (this.#a(n.effects), this.#a(n.render_effects))
        : ((L = null), _n(n.render_effects), _n(n.effects), this.#i?.resolve()),
      (ee = null));
  }
  #l(t, n) {
    t.f ^= B;
    for (var r = t.first; r !== null; ) {
      var s = r.f,
        i = (s & (me | Qe)) !== 0,
        a = i && (s & B) !== 0,
        o = a || (s & X) !== 0 || this.skipped_effects.has(r);
      if (((r.f & en) !== 0 && r.b?.is_pending() && (n = { parent: n, effect: r, effects: [], render_effects: [] }), !o && r.fn !== null)) {
        i ? (r.f ^= B) : (s & Qt) !== 0 ? n.effects.push(r) : et(r) && ((r.f & ge) !== 0 && this.#s.add(r), Xe(r));
        var u = r.first;
        if (u !== null) {
          r = u;
          continue;
        }
      }
      var l = r.parent;
      for (r = r.next; r === null && l !== null; )
        (l === n.effect && (this.#a(n.effects), this.#a(n.render_effects), (n = n.parent)), (r = l.next), (l = l.parent));
    }
  }
  #a(t) {
    for (const n of t) ((n.f & G) !== 0 ? this.#s.add(n) : (n.f & re) !== 0 && this.#o.add(n), this.#u(n.deps), U(n, B));
  }
  #u(t) {
    if (t !== null) for (const n of t) (n.f & V) === 0 || (n.f & Fe) === 0 || ((n.f ^= Fe), this.#u(n.deps));
  }
  capture(t, n) {
    (this.previous.has(t) || this.previous.set(t, n), (t.f & Re) === 0 && (this.current.set(t, t.v), ee?.set(t, t.v)));
  }
  activate() {
    ((L = this), this.apply());
  }
  deactivate() {
    L === this && ((L = null), (ee = null));
  }
  flush() {
    if ((this.activate(), Q.length > 0)) {
      if ((Hn(), L !== null && L !== this)) return;
    } else this.#e === 0 && this.process([]);
    this.deactivate();
  }
  discard() {
    for (const t of this.#n) t(this);
    this.#n.clear();
  }
  #f() {
    if (this.#r === 0) {
      for (const t of this.#t) t();
      this.#t.clear();
    }
    this.#e === 0 && this.#c();
  }
  #c() {
    if (ht.size > 1) {
      this.previous.clear();
      var t = ee,
        n = !0,
        r = { parent: null, effect: null, effects: [], render_effects: [] };
      for (const i of ht) {
        if (i === this) {
          n = !1;
          continue;
        }
        const a = [];
        for (const [u, l] of this.current) {
          if (i.current.has(u))
            if (n && l !== i.current.get(u)) i.current.set(u, l);
            else continue;
          a.push(u);
        }
        if (a.length === 0) continue;
        const o = [...i.current.keys()].filter((u) => !this.current.has(u));
        if (o.length > 0) {
          var s = Q;
          Q = [];
          const u = new Set(),
            l = new Map();
          for (const d of a) Yn(d, o, u, l);
          if (Q.length > 0) {
            ((L = i), i.apply());
            for (const d of Q) i.#l(d, r);
            i.deactivate();
          }
          Q = s;
        }
      }
      ((L = null), (ee = t));
    }
    ((this.committed = !0), ht.delete(this));
  }
  increment(t) {
    ((this.#e += 1), t && (this.#r += 1));
  }
  decrement(t) {
    ((this.#e -= 1), t && (this.#r -= 1), this.revive());
  }
  revive() {
    for (const t of this.#s) (this.#o.delete(t), U(t, G), Be(t));
    for (const t of this.#o) (U(t, re), Be(t));
    this.flush();
  }
  oncommit(t) {
    this.#t.add(t);
  }
  ondiscard(t) {
    this.#n.add(t);
  }
  settled() {
    return (this.#i ??= Ln()).promise;
  }
  static ensure() {
    if (L === null) {
      const t = (L = new st());
      (ht.add(L),
        rt ||
          st.enqueue(() => {
            L === t && t.flush();
          }));
    }
    return L;
  }
  static enqueue(t) {
    Vn(t);
  }
  apply() {}
}
function Wr(e) {
  var t = rt;
  rt = !0;
  try {
    for (var n; ; ) {
      if ((Kr(), Q.length === 0 && (L?.flush(), Q.length === 0))) return ((Rt = null), n);
      Hn();
    }
  } finally {
    rt = t;
  }
}
function Hn() {
  var e = De;
  Ut = !0;
  var t = null;
  try {
    var n = 0;
    for (Et(!0); Q.length > 0; ) {
      var r = st.ensure();
      if (n++ > 1e3) {
        var s, i;
        Xr();
      }
      (r.process(Q), Ie.clear());
    }
  } finally {
    ((Ut = !1), Et(e), (Rt = null));
  }
}
function Xr() {
  try {
    Ur();
  } catch (e) {
    bt(e, Rt);
  }
}
let fe = null;
function _n(e) {
  var t = e.length;
  if (t !== 0) {
    for (var n = 0; n < t; ) {
      var r = e[n++];
      if (
        (r.f & (ce | X)) === 0 &&
        et(r) &&
        ((fe = new Set()),
        Xe(r),
        r.deps === null && r.first === null && r.nodes === null && (r.teardown === null && r.ac === null ? nr(r) : (r.fn = null)),
        fe?.size > 0)
      ) {
        Ie.clear();
        for (const s of fe) {
          if ((s.f & (ce | X)) !== 0) continue;
          const i = [s];
          let a = s.parent;
          for (; a !== null; ) (fe.has(a) && (fe.delete(a), i.push(a)), (a = a.parent));
          for (let o = i.length - 1; o >= 0; o--) {
            const u = i[o];
            (u.f & (ce | X)) === 0 && Xe(u);
          }
        }
        fe.clear();
      }
    }
    fe = null;
  }
}
function Yn(e, t, n, r) {
  if (!n.has(e) && (n.add(e), e.reactions !== null))
    for (const s of e.reactions) {
      const i = s.f;
      (i & V) !== 0 ? Yn(s, t, n, r) : (i & (nn | ge)) !== 0 && (i & G) === 0 && zn(s, t, r) && (U(s, G), Be(s));
    }
}
function zn(e, t, n) {
  const r = n.get(e);
  if (r !== void 0) return r;
  if (e.deps !== null)
    for (const s of e.deps) {
      if (t.includes(s)) return !0;
      if ((s.f & V) !== 0 && zn(s, t, n)) return (n.set(s, !0), !0);
    }
  return (n.set(e, !1), !1);
}
function Be(e) {
  for (var t = (Rt = e); t.parent !== null; ) {
    t = t.parent;
    var n = t.f;
    if (Ut && t === N && (n & ge) !== 0 && (n & Mn) === 0) return;
    if ((n & (Qe | me)) !== 0) {
      if ((n & B) === 0) return;
      t.f ^= B;
    }
  }
  Q.push(t);
}
function Zr(e, t, n, r) {
  const s = ut() ? It : rn;
  if (n.length === 0 && e.length === 0) {
    r(t.map(s));
    return;
  }
  var i = L,
    a = N,
    o = Qr();
  function u() {
    Promise.all(n.map((l) => es(l)))
      .then((l) => {
        o();
        try {
          r([...t.map(s), ...l]);
        } catch (d) {
          (a.f & ce) === 0 && bt(d, a);
        }
        (i?.deactivate(), wt());
      })
      .catch((l) => {
        bt(l, a);
      });
  }
  e.length > 0
    ? Promise.all(e).then(() => {
        o();
        try {
          return u();
        } finally {
          (i?.deactivate(), wt());
        }
      })
    : u();
}
function Qr() {
  var e = N,
    t = $,
    n = P,
    r = L;
  return function (i = !0) {
    ($e(e), ue(t), mt(n), i && r?.activate());
  };
}
function wt() {
  ($e(null), ue(null), mt(null));
}
function It(e) {
  var t = V | G,
    n = $ !== null && ($.f & V) !== 0 ? $ : null;
  return (
    N !== null && (N.f |= xt),
    { ctx: P, deps: null, effects: null, equals: Fn, f: t, fn: e, reactions: null, rv: 0, v: Y, wv: 0, parent: n ?? N, ac: null }
  );
}
function es(e, t) {
  let n = N;
  n === null && qr();
  var r = n.b,
    s = void 0,
    i = it(Y),
    a = !$,
    o = new Map();
  return (
    cs(() => {
      var u = Ln();
      s = u.promise;
      try {
        Promise.resolve(e())
          .then(u.resolve, u.reject)
          .then(() => {
            (l === L && l.committed && l.deactivate(), wt());
          });
      } catch (f) {
        (u.reject(f), wt());
      }
      var l = L;
      if (a) {
        var d = !r.is_pending();
        (r.update_pending_count(1), l.increment(d), o.get(l)?.reject(ze), o.delete(l), o.set(l, u));
      }
      const v = (f, h = void 0) => {
        if ((l.activate(), h)) h !== ze && ((i.f |= Re), ot(i, h));
        else {
          ((i.f & Re) !== 0 && (i.f ^= Re), ot(i, f));
          for (const [c, y] of o) {
            if ((o.delete(c), c === l)) break;
            y.reject(ze);
          }
        }
        a && (r.update_pending_count(-1), l.decrement(d));
      };
      u.promise.then(v, (f) => v(null, f || "unknown"));
    }),
    on(() => {
      for (const u of o.values()) u.reject(ze);
    }),
    new Promise((u) => {
      function l(d) {
        function v() {
          d === s ? u(i) : l(s);
        }
        d.then(v, v);
      }
      l(s);
    })
  );
}
function rn(e) {
  const t = It(e);
  return ((t.equals = jn), t);
}
function Jn(e) {
  var t = e.effects;
  if (t !== null) {
    e.effects = null;
    for (var n = 0; n < t.length; n += 1) ve(t[n]);
  }
}
function ts(e) {
  for (var t = e.parent; t !== null; ) {
    if ((t.f & V) === 0) return (t.f & ce) === 0 ? t : null;
    t = t.parent;
  }
  return null;
}
function sn(e) {
  var t,
    n = N;
  $e(ts(e));
  try {
    ((e.f &= ~Fe), Jn(e), (t = lr(e)));
  } finally {
    $e(n);
  }
  return t;
}
function Kn(e) {
  var t = sn(e);
  if ((e.equals(t) || (L?.is_fork || (e.v = t), (e.wv = or())), !je))
    if (ee !== null) (kt() || L?.is_fork) && ee.set(e, t);
    else {
      var n = (e.f & ne) === 0 ? re : B;
      U(e, n);
    }
}
let Vt = new Set();
const Ie = new Map();
let Gn = !1;
function it(e, t) {
  var n = { f: 0, v: e, reactions: null, equals: Fn, rv: 0, wv: 0 };
  return n;
}
function ke(e, t) {
  const n = it(e);
  return (ps(n), n);
}
function j(e, t = !1, n = !0) {
  const r = it(e);
  return (t || (r.equals = jn), Ze && n && P !== null && P.l !== null && (P.l.s ??= []).push(r), r);
}
function E(e, t, n = !1) {
  $ !== null && (!ae || ($.f & pn) !== 0) && ut() && ($.f & (V | ge | nn | pn)) !== 0 && !he?.includes(e) && Jr();
  let r = n ? Je(t) : t;
  return ot(e, r);
}
function ot(e, t) {
  if (!e.equals(t)) {
    var n = e.v;
    (je ? Ie.set(e, t) : Ie.set(e, n), (e.v = t));
    var r = st.ensure();
    (r.capture(e, n),
      (e.f & V) !== 0 && ((e.f & G) !== 0 && sn(e), U(e, (e.f & ne) !== 0 ? B : re)),
      (e.wv = or()),
      Wn(e, G),
      ut() && N !== null && (N.f & B) !== 0 && (N.f & (me | Qe)) === 0 && (Z === null ? _s([e]) : Z.push(e)),
      !r.is_fork && Vt.size > 0 && !Gn && ns());
  }
  return t;
}
function ns() {
  Gn = !1;
  var e = De;
  Et(!0);
  const t = Array.from(Vt);
  try {
    for (const n of t) ((n.f & B) !== 0 && U(n, re), et(n) && Xe(n));
  } finally {
    Et(e);
  }
  Vt.clear();
}
function qt(e) {
  E(e, e.v + 1);
}
function Wn(e, t) {
  var n = e.reactions;
  if (n !== null)
    for (var r = ut(), s = n.length, i = 0; i < s; i++) {
      var a = n[i],
        o = a.f;
      if (!(!r && a === N)) {
        var u = (o & G) === 0;
        if ((u && U(a, t), (o & V) !== 0)) {
          var l = a;
          (ee?.delete(l), (o & Fe) === 0 && (o & ne && (a.f |= Fe), Wn(l, re)));
        } else u && ((o & ge) !== 0 && fe !== null && fe.add(a), Be(a));
      }
    }
}
function Je(e) {
  if (typeof e != "object" || e === null || Me in e) return e;
  const t = Zt(e);
  if (t !== Pr && t !== Lr) return e;
  var n = new Map(),
    r = St(e),
    s = ke(0),
    i = qe,
    a = (o) => {
      if (qe === i) return o();
      var u = $,
        l = qe;
      (ue(null), bn(i));
      var d = o();
      return (ue(u), bn(l), d);
    };
  return (
    r && n.set("length", ke(e.length)),
    new Proxy(e, {
      defineProperty(o, u, l) {
        (!("value" in l) || l.configurable === !1 || l.enumerable === !1 || l.writable === !1) && Yr();
        var d = n.get(u);
        return (
          d === void 0
            ? (d = a(() => {
                var v = ke(l.value);
                return (n.set(u, v), v);
              }))
            : E(d, l.value, !0),
          !0
        );
      },
      deleteProperty(o, u) {
        var l = n.get(u);
        if (l === void 0) {
          if (u in o) {
            const d = a(() => ke(Y));
            (n.set(u, d), qt(s));
          }
        } else (E(l, Y), qt(s));
        return !0;
      },
      get(o, u, l) {
        if (u === Me) return e;
        var d = n.get(u),
          v = u in o;
        if (
          (d === void 0 &&
            (!v || Ke(o, u)?.writable) &&
            ((d = a(() => {
              var h = Je(v ? o[u] : Y),
                c = ke(h);
              return c;
            })),
            n.set(u, d)),
          d !== void 0)
        ) {
          var f = p(d);
          return f === Y ? void 0 : f;
        }
        return Reflect.get(o, u, l);
      },
      getOwnPropertyDescriptor(o, u) {
        var l = Reflect.getOwnPropertyDescriptor(o, u);
        if (l && "value" in l) {
          var d = n.get(u);
          d && (l.value = p(d));
        } else if (l === void 0) {
          var v = n.get(u),
            f = v?.v;
          if (v !== void 0 && f !== Y) return { enumerable: !0, configurable: !0, value: f, writable: !0 };
        }
        return l;
      },
      has(o, u) {
        if (u === Me) return !0;
        var l = n.get(u),
          d = (l !== void 0 && l.v !== Y) || Reflect.has(o, u);
        if (l !== void 0 || (N !== null && (!d || Ke(o, u)?.writable))) {
          l === void 0 &&
            ((l = a(() => {
              var f = d ? Je(o[u]) : Y,
                h = ke(f);
              return h;
            })),
            n.set(u, l));
          var v = p(l);
          if (v === Y) return !1;
        }
        return d;
      },
      set(o, u, l, d) {
        var v = n.get(u),
          f = u in o;
        if (r && u === "length")
          for (var h = l; h < v.v; h += 1) {
            var c = n.get(h + "");
            c !== void 0 ? E(c, Y) : h in o && ((c = a(() => ke(Y))), n.set(h + "", c));
          }
        if (v === void 0) (!f || Ke(o, u)?.writable) && ((v = a(() => ke(void 0))), E(v, Je(l)), n.set(u, v));
        else {
          f = v.v !== Y;
          var y = a(() => Je(l));
          E(v, y);
        }
        var T = Reflect.getOwnPropertyDescriptor(o, u);
        if ((T?.set && T.set.call(d, l), !f)) {
          if (r && typeof u == "string") {
            var k = n.get("length"),
              S = Number(u);
            Number.isInteger(S) && S >= k.v && E(k, S + 1);
          }
          qt(s);
        }
        return !0;
      },
      ownKeys(o) {
        p(s);
        var u = Reflect.ownKeys(o).filter((v) => {
          var f = n.get(v);
          return f === void 0 || f.v !== Y;
        });
        for (var [l, d] of n) d.v !== Y && !(l in o) && u.push(l);
        return u;
      },
      setPrototypeOf() {
        zr();
      },
    })
  );
}
var rs, ss, is;
function Ge(e = "") {
  return document.createTextNode(e);
}
function yt(e) {
  return ss.call(e);
}
function ft(e) {
  return is.call(e);
}
function A(e, t) {
  return yt(e);
}
function de(e, t = !1) {
  {
    var n = yt(e);
    return n instanceof Comment && n.data === "" ? ft(n) : n;
  }
}
function I(e, t = 1, n = !1) {
  let r = e;
  for (; t--; ) r = ft(r);
  return r;
}
function os(e) {
  e.textContent = "";
}
function Xn() {
  return !1;
}
let gn = !1;
function as() {
  gn ||
    ((gn = !0),
    document.addEventListener(
      "reset",
      (e) => {
        Promise.resolve().then(() => {
          if (!e.defaultPrevented) for (const t of e.target.elements) t.__on_r?.();
        });
      },
      { capture: !0 },
    ));
}
function $t(e) {
  var t = $,
    n = N;
  (ue(null), $e(null));
  try {
    return e();
  } finally {
    (ue(t), $e(n));
  }
}
function ls(e, t, n, r = n) {
  e.addEventListener(t, () => $t(n));
  const s = e.__on_r;
  (s
    ? (e.__on_r = () => {
        (s(), r(!0));
      })
    : (e.__on_r = () => r(!0)),
    as());
}
function Zn(e) {
  (N === null && ($ === null && jr(), Br()), je && Fr());
}
function us(e, t) {
  var n = t.last;
  n === null ? (t.last = t.first = e) : ((n.next = e), (e.prev = n), (t.last = e));
}
function be(e, t, n) {
  var r = N;
  r !== null && (r.f & X) !== 0 && (e |= X);
  var s = {
    ctx: P,
    deps: null,
    nodes: null,
    f: e | G | ne,
    first: null,
    fn: t,
    last: null,
    next: null,
    parent: r,
    b: r && r.b,
    prev: null,
    teardown: null,
    wv: 0,
    ac: null,
  };
  if (n)
    try {
      (Xe(s), (s.f |= tn));
    } catch (o) {
      throw (ve(s), o);
    }
  else t !== null && Be(s);
  var i = s;
  if (
    (n &&
      i.deps === null &&
      i.teardown === null &&
      i.nodes === null &&
      i.first === i.last &&
      (i.f & xt) === 0 &&
      ((i = i.first), (e & ge) !== 0 && (e & We) !== 0 && i !== null && (i.f |= We)),
    i !== null && ((i.parent = r), r !== null && us(i, r), $ !== null && ($.f & V) !== 0 && (e & Qe) === 0))
  ) {
    var a = $;
    (a.effects ??= []).push(i);
  }
  return s;
}
function kt() {
  return $ !== null && !ae;
}
function on(e) {
  const t = be(At, null, !1);
  return (U(t, B), (t.teardown = e), t);
}
function Ht(e) {
  Zn();
  var t = N.f,
    n = !$ && (t & me) !== 0 && (t & tn) === 0;
  if (n) {
    var r = P;
    (r.e ??= []).push(e);
  } else return Qn(e);
}
function Qn(e) {
  return be(Qt | Dn, e, !1);
}
function fs(e) {
  return (Zn(), be(At | Dn, e, !0));
}
function Ye(e) {
  return be(Qt, e, !1);
}
function an(e, t) {
  var n = P,
    r = { effect: null, ran: !1, deps: e };
  (n.l.$.push(r),
    (r.effect = un(() => {
      (e(), !r.ran && ((r.ran = !0), z(t)));
    })));
}
function ln() {
  var e = P;
  un(() => {
    for (var t of e.l.$) {
      t.deps();
      var n = t.effect;
      ((n.f & B) !== 0 && U(n, re), et(n) && Xe(n), (t.ran = !1));
    }
  });
}
function cs(e) {
  return be(nn | xt, e, !0);
}
function un(e, t = 0) {
  return be(At | t, e, !0);
}
function le(e, t = [], n = [], r = []) {
  Zr(r, t, n, (s) => {
    be(At, () => e(...s.map(p)), !0);
  });
}
function fn(e, t = 0) {
  var n = be(ge | t, e, !0);
  return n;
}
function at(e) {
  return be(me | xt, e, !0);
}
function er(e) {
  var t = e.teardown;
  if (t !== null) {
    const n = je,
      r = $;
    (mn(!0), ue(null));
    try {
      t.call(null);
    } finally {
      (mn(n), ue(r));
    }
  }
}
function tr(e, t = !1) {
  var n = e.first;
  for (e.first = e.last = null; n !== null; ) {
    const s = n.ac;
    s !== null &&
      $t(() => {
        s.abort(ze);
      });
    var r = n.next;
    ((n.f & Qe) !== 0 ? (n.parent = null) : ve(n, t), (n = r));
  }
}
function ds(e) {
  for (var t = e.first; t !== null; ) {
    var n = t.next;
    ((t.f & me) === 0 && ve(t), (t = n));
  }
}
function ve(e, t = !0) {
  var n = !1;
  ((t || (e.f & Mn) !== 0) && e.nodes !== null && e.nodes.end !== null && (vs(e.nodes.start, e.nodes.end), (n = !0)),
    tr(e, t && !n),
    Tt(e, 0),
    U(e, ce));
  var r = e.nodes && e.nodes.t;
  if (r !== null) for (const i of r) i.stop();
  er(e);
  var s = e.parent;
  (s !== null && s.first !== null && nr(e), (e.next = e.prev = e.teardown = e.ctx = e.deps = e.fn = e.nodes = e.ac = null));
}
function vs(e, t) {
  for (; e !== null; ) {
    var n = e === t ? null : ft(e);
    (e.remove(), (e = n));
  }
}
function nr(e) {
  var t = e.parent,
    n = e.prev,
    r = e.next;
  (n !== null && (n.next = r), r !== null && (r.prev = n), t !== null && (t.first === e && (t.first = r), t.last === e && (t.last = n)));
}
function cn(e, t, n = !0) {
  var r = [];
  rr(e, r, !0);
  var s = () => {
      (n && ve(e), t && t());
    },
    i = r.length;
  if (i > 0) {
    var a = () => --i || s();
    for (var o of r) o.out(a);
  } else s();
}
function rr(e, t, n) {
  if ((e.f & X) === 0) {
    e.f ^= X;
    var r = e.nodes && e.nodes.t;
    if (r !== null) for (const o of r) (o.is_global || n) && t.push(o);
    for (var s = e.first; s !== null; ) {
      var i = s.next,
        a = (s.f & We) !== 0 || ((s.f & me) !== 0 && (e.f & ge) !== 0);
      (rr(s, t, a ? n : !1), (s = i));
    }
  }
}
function dn(e) {
  sr(e, !0);
}
function sr(e, t) {
  if ((e.f & X) !== 0) {
    ((e.f ^= X), (e.f & B) === 0 && (U(e, G), Be(e)));
    for (var n = e.first; n !== null; ) {
      var r = n.next,
        s = (n.f & We) !== 0 || (n.f & me) !== 0;
      (sr(n, s ? t : !1), (n = r));
    }
    var i = e.nodes && e.nodes.t;
    if (i !== null) for (const a of i) (a.is_global || t) && a.in();
  }
}
function hs(e, t) {
  if (e.nodes)
    for (var n = e.nodes.start, r = e.nodes.end; n !== null; ) {
      var s = n === r ? null : ft(n);
      (t.append(n), (n = s));
    }
}
let De = !1;
function Et(e) {
  De = e;
}
let je = !1;
function mn(e) {
  je = e;
}
let $ = null,
  ae = !1;
function ue(e) {
  $ = e;
}
let N = null;
function $e(e) {
  N = e;
}
let he = null;
function ps(e) {
  $ !== null && (he === null ? (he = [e]) : he.push(e));
}
let J = null,
  W = 0,
  Z = null;
function _s(e) {
  Z = e;
}
let ir = 1,
  lt = 0,
  qe = lt;
function bn(e) {
  qe = e;
}
function or() {
  return ++ir;
}
function et(e) {
  var t = e.f;
  if ((t & G) !== 0) return !0;
  if ((t & V && (e.f &= ~Fe), (t & re) !== 0)) {
    var n = e.deps;
    if (n !== null)
      for (var r = n.length, s = 0; s < r; s++) {
        var i = n[s];
        if ((et(i) && Kn(i), i.wv > e.wv)) return !0;
      }
    (t & ne) !== 0 && ee === null && U(e, B);
  }
  return !1;
}
function ar(e, t, n = !0) {
  var r = e.reactions;
  if (r !== null && !he?.includes(e))
    for (var s = 0; s < r.length; s++) {
      var i = r[s];
      (i.f & V) !== 0 ? ar(i, t, !1) : t === i && (n ? U(i, G) : (i.f & B) !== 0 && U(i, re), Be(i));
    }
}
function lr(e) {
  var t = J,
    n = W,
    r = Z,
    s = $,
    i = he,
    a = P,
    o = ae,
    u = qe,
    l = e.f;
  ((J = null),
    (W = 0),
    (Z = null),
    ($ = (l & (me | Qe)) === 0 ? e : null),
    (he = null),
    mt(e.ctx),
    (ae = !1),
    (qe = ++lt),
    e.ac !== null &&
      ($t(() => {
        e.ac.abort(ze);
      }),
      (e.ac = null)));
  try {
    e.f |= jt;
    var d = e.fn,
      v = d(),
      f = e.deps;
    if (J !== null) {
      var h;
      if ((Tt(e, W), f !== null && W > 0)) for (f.length = W + J.length, h = 0; h < J.length; h++) f[W + h] = J[h];
      else e.deps = f = J;
      if (kt() && (e.f & ne) !== 0) for (h = W; h < f.length; h++) (f[h].reactions ??= []).push(e);
    } else f !== null && W < f.length && (Tt(e, W), (f.length = W));
    if (ut() && Z !== null && !ae && f !== null && (e.f & (V | re | G)) === 0) for (h = 0; h < Z.length; h++) ar(Z[h], e);
    return (s !== null && s !== e && (lt++, Z !== null && (r === null ? (r = Z) : r.push(...Z))), (e.f & Re) !== 0 && (e.f ^= Re), v);
  } catch (c) {
    return Gr(c);
  } finally {
    ((e.f ^= jt), (J = t), (W = n), (Z = r), ($ = s), (he = i), mt(a), (ae = o), (qe = u));
  }
}
function gs(e, t) {
  let n = t.reactions;
  if (n !== null) {
    var r = Nr.call(n, e);
    if (r !== -1) {
      var s = n.length - 1;
      s === 0 ? (n = t.reactions = null) : ((n[r] = n[s]), n.pop());
    }
  }
  n === null &&
    (t.f & V) !== 0 &&
    (J === null || !J.includes(t)) &&
    (U(t, re), (t.f & ne) !== 0 && ((t.f ^= ne), (t.f &= ~Fe)), Jn(t), Tt(t, 0));
}
function Tt(e, t) {
  var n = e.deps;
  if (n !== null) for (var r = t; r < n.length; r++) gs(e, n[r]);
}
function Xe(e) {
  var t = e.f;
  if ((t & ce) === 0) {
    U(e, B);
    var n = N,
      r = De;
    ((N = e), (De = !0));
    try {
      ((t & (ge | Dr)) !== 0 ? ds(e) : tr(e), er(e));
      var s = lr(e);
      ((e.teardown = typeof s == "function" ? s : null), (e.wv = ir));
      var i;
      Bt && wr && (e.f & G) !== 0 && e.deps;
    } finally {
      ((De = r), (N = n));
    }
  }
}
async function ur() {
  (await Promise.resolve(), Wr());
}
function p(e) {
  var t = e.f,
    n = (t & V) !== 0;
  if ($ !== null && !ae) {
    var r = N !== null && (N.f & ce) !== 0;
    if (!r && !he?.includes(e)) {
      var s = $.deps;
      if (($.f & jt) !== 0)
        e.rv < lt && ((e.rv = lt), J === null && s !== null && s[W] === e ? W++ : J === null ? (J = [e]) : J.includes(e) || J.push(e));
      else {
        ($.deps ??= []).push(e);
        var i = e.reactions;
        i === null ? (e.reactions = [$]) : i.includes($) || i.push($);
      }
    }
  }
  if (je) {
    if (Ie.has(e)) return Ie.get(e);
    if (n) {
      var a = e,
        o = a.v;
      return ((((a.f & B) === 0 && a.reactions !== null) || cr(a)) && (o = sn(a)), Ie.set(a, o), o);
    }
  } else n && (!ee?.has(e) || (L?.is_fork && !kt())) && ((a = e), et(a) && Kn(a), De && kt() && (a.f & ne) === 0 && fr(a));
  if (ee?.has(e)) return ee.get(e);
  if ((e.f & Re) !== 0) throw e.v;
  return e.v;
}
function fr(e) {
  if (e.deps !== null) {
    e.f ^= ne;
    for (const t of e.deps) ((t.reactions ??= []).push(e), (t.f & V) !== 0 && (t.f & ne) === 0 && fr(t));
  }
}
function cr(e) {
  if (e.v === Y) return !0;
  if (e.deps === null) return !1;
  for (const t of e.deps) if (Ie.has(t) || ((t.f & V) !== 0 && cr(t))) return !0;
  return !1;
}
function z(e) {
  var t = ae;
  try {
    return ((ae = !0), e());
  } finally {
    ae = t;
  }
}
const ms = -7169;
function U(e, t) {
  e.f = (e.f & ms) | t;
}
function dr(e) {
  if (!(typeof e != "object" || !e || e instanceof EventTarget)) {
    if (Me in e) Yt(e);
    else if (!Array.isArray(e))
      for (let t in e) {
        const n = e[t];
        typeof n == "object" && n && Me in n && Yt(n);
      }
  }
}
function Yt(e, t = new Set()) {
  if (typeof e == "object" && e !== null && !(e instanceof EventTarget) && !t.has(e)) {
    (t.add(e), e instanceof Date && e.getTime());
    for (let r in e)
      try {
        Yt(e[r], t);
      } catch {}
    const n = Zt(e);
    if (n !== Object.prototype && n !== Array.prototype && n !== Map.prototype && n !== Set.prototype && n !== Date.prototype) {
      const r = Pn(n);
      for (let s in r) {
        const i = r[s].get;
        if (i)
          try {
            i.call(e);
          } catch {}
      }
    }
  }
}
function bs(e, t, n, r = {}) {
  function s(i) {
    if ((r.capture || ws.call(t, i), !i.cancelBubble)) return $t(() => n?.call(this, i));
  }
  return (
    e.startsWith("pointer") || e.startsWith("touch") || e === "wheel"
      ? Vn(() => {
          t.addEventListener(e, s, r);
        })
      : t.addEventListener(e, s, r),
    s
  );
}
function ie(e, t, n, r, s) {
  var i = { capture: r, passive: s },
    a = bs(e, t, n, i);
  (t === document.body || t === window || t === document || t instanceof HTMLMediaElement) &&
    on(() => {
      t.removeEventListener(e, a, i);
    });
}
let wn = null;
function ws(e) {
  var t = this,
    n = t.ownerDocument,
    r = e.type,
    s = e.composedPath?.() || [],
    i = s[0] || e.target;
  wn = e;
  var a = 0,
    o = wn === e && e.__root;
  if (o) {
    var u = s.indexOf(o);
    if (u !== -1 && (t === document || t === window)) {
      e.__root = t;
      return;
    }
    var l = s.indexOf(t);
    if (l === -1) return;
    u <= l && (a = u);
  }
  if (((i = s[a] || e.target), i !== t)) {
    Nn(e, "currentTarget", {
      configurable: !0,
      get() {
        return i || n;
      },
    });
    var d = $,
      v = N;
    (ue(null), $e(null));
    try {
      for (var f, h = []; i !== null; ) {
        var c = i.assignedSlot || i.parentNode || i.host || null;
        try {
          var y = i["__" + r];
          y != null && (!i.disabled || e.target === i) && y.call(i, e);
        } catch (T) {
          f ? h.push(T) : (f = T);
        }
        if (e.cancelBubble || c === t || c === null) break;
        i = c;
      }
      if (f) {
        for (let T of h)
          queueMicrotask(() => {
            throw T;
          });
        throw f;
      }
    } finally {
      ((e.__root = t), delete e.currentTarget, ue(d), $e(v));
    }
  }
}
function ys(e) {
  var t = document.createElement("template");
  return ((t.innerHTML = e.replaceAll("<!>", "<!---->")), t.content);
}
function zt(e, t) {
  var n = N;
  n.nodes === null && (n.nodes = { start: e, end: t, a: null, t: null });
}
function O(e, t) {
  var n = (t & Ir) !== 0,
    r = (t & $r) !== 0,
    s,
    i = !e.startsWith("<!>");
  return () => {
    s === void 0 && ((s = ys(i ? e : "<!>" + e)), n || (s = yt(s)));
    var a = r || rs ? document.importNode(s, !0) : s.cloneNode(!0);
    if (n) {
      var o = yt(a),
        u = a.lastChild;
      zt(o, u);
    } else zt(a, a);
    return a;
  };
}
function _t() {
  var e = document.createDocumentFragment(),
    t = document.createComment(""),
    n = Ge();
  return (e.append(t, n), zt(t, n), e);
}
function x(e, t) {
  e !== null && e.before(t);
}
function K(e, t) {
  var n = t == null ? "" : typeof t == "object" ? t + "" : t;
  n !== (e.__t ??= e.nodeValue) && ((e.__t = n), (e.nodeValue = n + ""));
}
class vr {
  anchor;
  #t = new Map();
  #n = new Map();
  #e = new Map();
  #r = new Set();
  #i = !0;
  constructor(t, n = !0) {
    ((this.anchor = t), (this.#i = n));
  }
  #s = () => {
    var t = L;
    if (this.#t.has(t)) {
      var n = this.#t.get(t),
        r = this.#n.get(n);
      if (r) (dn(r), this.#r.delete(n));
      else {
        var s = this.#e.get(n);
        s && (this.#n.set(n, s.effect), this.#e.delete(n), s.fragment.lastChild.remove(), this.anchor.before(s.fragment), (r = s.effect));
      }
      for (const [i, a] of this.#t) {
        if ((this.#t.delete(i), i === t)) break;
        const o = this.#e.get(a);
        o && (ve(o.effect), this.#e.delete(a));
      }
      for (const [i, a] of this.#n) {
        if (i === n || this.#r.has(i)) continue;
        const o = () => {
          if (Array.from(this.#t.values()).includes(i)) {
            var l = document.createDocumentFragment();
            (hs(a, l), l.append(Ge()), this.#e.set(i, { effect: a, fragment: l }));
          } else ve(a);
          (this.#r.delete(i), this.#n.delete(i));
        };
        this.#i || !r ? (this.#r.add(i), cn(a, o, !1)) : o();
      }
    }
  };
  #o = (t) => {
    this.#t.delete(t);
    const n = Array.from(this.#t.values());
    for (const [r, s] of this.#e) n.includes(r) || (ve(s.effect), this.#e.delete(r));
  };
  ensure(t, n) {
    var r = L,
      s = Xn();
    if (n && !this.#n.has(t) && !this.#e.has(t))
      if (s) {
        var i = document.createDocumentFragment(),
          a = Ge();
        (i.append(a), this.#e.set(t, { effect: at(() => n(a)), fragment: i }));
      } else
        this.#n.set(
          t,
          at(() => n(this.anchor)),
        );
    if ((this.#t.set(r, t), s)) {
      for (const [o, u] of this.#n) o === t ? r.skipped_effects.delete(u) : r.skipped_effects.add(u);
      for (const [o, u] of this.#e) o === t ? r.skipped_effects.delete(u.effect) : r.skipped_effects.add(u.effect);
      (r.oncommit(this.#s), r.ondiscard(this.#o));
    } else this.#s();
  }
}
function ct(e) {
  (P === null && Ot(),
    Ze && P.l !== null
      ? hr(P).m.push(e)
      : Ht(() => {
          const t = z(e);
          if (typeof t == "function") return t;
        }));
}
function ks(e) {
  (P === null && Ot(), ct(() => () => z(e)));
}
function Es(e, t, { bubbles: n = !1, cancelable: r = !1 } = {}) {
  return new CustomEvent(e, { detail: t, bubbles: n, cancelable: r });
}
function Ts() {
  const e = P;
  return (
    e === null && Ot(),
    (t, n, r) => {
      const s = e.s.$$events?.[t];
      if (s) {
        const i = St(s) ? s.slice() : [s],
          a = Es(t, n, r);
        for (const o of i) o.call(e.x, a);
        return !a.defaultPrevented;
      }
      return !0;
    }
  );
}
function Ss(e) {
  (P === null && Ot(), P.l === null && Vr(), hr(P).a.push(e));
}
function hr(e) {
  var t = e.l;
  return (t.u ??= { a: [], b: [], m: [] });
}
function te(e, t, n = !1) {
  var r = new vr(e),
    s = n ? We : 0;
  function i(a, o) {
    r.ensure(a, o);
  }
  fn(() => {
    var a = !1;
    (t((o, u = !0) => {
      ((a = !0), i(u, o));
    }),
      a || i(!1, null));
  }, s);
}
function Jt(e, t) {
  return t;
}
function As(e, t, n) {
  for (var r = [], s = t.length, i, a = t.length, o = 0; o < s; o++) {
    let v = t[o];
    cn(
      v,
      () => {
        if (i) {
          if ((i.pending.delete(v), i.done.add(v), i.pending.size === 0)) {
            var f = e.outrogroups;
            (Kt(Xt(i.done)), f.delete(i), f.size === 0 && (e.outrogroups = null));
          }
        } else a -= 1;
      },
      !1,
    );
  }
  if (a === 0) {
    var u = r.length === 0 && n !== null;
    if (u) {
      var l = n,
        d = l.parentNode;
      (os(d), d.append(l), e.items.clear());
    }
    Kt(t, !u);
  } else ((i = { pending: new Set(t), done: new Set() }), (e.outrogroups ??= new Set()).add(i));
}
function Kt(e, t = !0) {
  for (var n = 0; n < e.length; n++) ve(e[n], t);
}
var yn;
function Gt(e, t, n, r, s, i = null) {
  var a = e,
    o = new Map();
  {
    var u = e;
    a = u.appendChild(Ge());
  }
  var l = null,
    d = rn(() => {
      var T = n();
      return St(T) ? T : T == null ? [] : Xt(T);
    }),
    v,
    f = !0;
  function h() {
    ((y.fallback = l),
      xs(y, v, a, t, r),
      l !== null &&
        (v.length === 0
          ? (l.f & Ae) === 0
            ? dn(l)
            : ((l.f ^= Ae), nt(l, null, a))
          : cn(l, () => {
              l = null;
            })));
  }
  var c = fn(() => {
      v = p(d);
      for (var T = v.length, k = new Set(), S = L, _ = Xn(), w = 0; w < T; w += 1) {
        var b = v[w],
          g = r(b, w),
          m = f ? null : o.get(g);
        (m
          ? (m.v && ot(m.v, b), m.i && ot(m.i, w), _ && S.skipped_effects.delete(m.e))
          : ((m = Os(o, f ? a : (yn ??= Ge()), b, g, w, s, t, n)), f || (m.e.f |= Ae), o.set(g, m)),
          k.add(g));
      }
      if ((T === 0 && i && !l && (f ? (l = at(() => i(a))) : ((l = at(() => i((yn ??= Ge())))), (l.f |= Ae))), !f))
        if (_) {
          for (const [R, C] of o) k.has(R) || S.skipped_effects.add(C.e);
          (S.oncommit(h), S.ondiscard(() => {}));
        } else h();
      p(d);
    }),
    y = { effect: c, items: o, outrogroups: null, fallback: l };
  f = !1;
}
function xs(e, t, n, r, s) {
  var i = t.length,
    a = e.items,
    o = e.effect.first,
    u,
    l = null,
    d = [],
    v = [],
    f,
    h,
    c,
    y;
  for (y = 0; y < i; y += 1) {
    if (((f = t[y]), (h = s(f, y)), (c = a.get(h).e), e.outrogroups !== null))
      for (const R of e.outrogroups) (R.pending.delete(c), R.done.delete(c));
    if ((c.f & Ae) !== 0)
      if (((c.f ^= Ae), c === o)) nt(c, null, n);
      else {
        var T = l ? l.next : o;
        (c === e.effect.last && (e.effect.last = c.prev),
          c.prev && (c.prev.next = c.next),
          c.next && (c.next.prev = c.prev),
          Ee(e, l, c),
          Ee(e, c, T),
          nt(c, T, n),
          (l = c),
          (d = []),
          (v = []),
          (o = l.next));
        continue;
      }
    if (((c.f & X) !== 0 && dn(c), c !== o)) {
      if (u !== void 0 && u.has(c)) {
        if (d.length < v.length) {
          var k = v[0],
            S;
          l = k.prev;
          var _ = d[0],
            w = d[d.length - 1];
          for (S = 0; S < d.length; S += 1) nt(d[S], k, n);
          for (S = 0; S < v.length; S += 1) u.delete(v[S]);
          (Ee(e, _.prev, w.next), Ee(e, l, _), Ee(e, w, k), (o = k), (l = w), (y -= 1), (d = []), (v = []));
        } else (u.delete(c), nt(c, o, n), Ee(e, c.prev, c.next), Ee(e, c, l === null ? e.effect.first : l.next), Ee(e, l, c), (l = c));
        continue;
      }
      for (d = [], v = []; o !== null && o !== c; ) ((u ??= new Set()).add(o), v.push(o), (o = o.next));
      if (o === null) continue;
    }
    ((c.f & Ae) === 0 && d.push(c), (l = c), (o = c.next));
  }
  if (e.outrogroups !== null) {
    for (const R of e.outrogroups) R.pending.size === 0 && (Kt(Xt(R.done)), e.outrogroups?.delete(R));
    e.outrogroups.size === 0 && (e.outrogroups = null);
  }
  if (o !== null || u !== void 0) {
    var b = [];
    if (u !== void 0) for (c of u) (c.f & X) === 0 && b.push(c);
    for (; o !== null; ) ((o.f & X) === 0 && o !== e.fallback && b.push(o), (o = o.next));
    var g = b.length;
    if (g > 0) {
      var m = i === 0 ? n : null;
      As(e, b, m);
    }
  }
}
function Os(e, t, n, r, s, i, a, o) {
  var u = (a & kr) !== 0 ? ((a & Tr) === 0 ? j(n, !1, !1) : it(n)) : null,
    l = (a & Er) !== 0 ? it(s) : null;
  return {
    v: u,
    i: l,
    e: at(
      () => (
        i(t, u ?? n, l ?? s, o),
        () => {
          e.delete(r);
        }
      ),
    ),
  };
}
function nt(e, t, n) {
  if (e.nodes)
    for (var r = e.nodes.start, s = e.nodes.end, i = t && (t.f & Ae) === 0 ? t.nodes.start : n; r !== null; ) {
      var a = ft(r);
      if ((i.before(r), r === s)) return;
      r = a;
    }
}
function Ee(e, t, n) {
  (t === null ? (e.effect.first = n) : (t.next = n), n === null ? (e.effect.last = t) : (n.prev = t));
}
function kn(e, t, n) {
  var r = new vr(e);
  fn(() => {
    var s = t() ?? null;
    r.ensure(s, s && ((i) => n(i, s)));
  }, We);
}
function Te(e, t, n) {
  Ye(() => {
    var r = z(() => t(e, n?.()) || {});
    if (r?.destroy) return () => r.destroy();
  });
}
const En = [
  ...` 	
\r\f \v\uFEFF`,
];
function Rs(e, t, n) {
  var r = e == null ? "" : "" + e;
  if (n) {
    for (var s in n)
      if (n[s]) r = r ? r + " " + s : s;
      else if (r.length)
        for (var i = s.length, a = 0; (a = r.indexOf(s, a)) >= 0; ) {
          var o = a + i;
          (a === 0 || En.includes(r[a - 1])) && (o === r.length || En.includes(r[o]))
            ? (r = (a === 0 ? "" : r.substring(0, a)) + r.substring(o + 1))
            : (a = o);
        }
  }
  return r === "" ? null : r;
}
function pr(e, t, n, r, s, i) {
  var a = e.__className;
  if (a !== n || a === void 0) {
    var o = Rs(n, r, i);
    (o == null ? e.removeAttribute("class") : (e.className = o), (e.__className = n));
  } else if (i && s !== i)
    for (var u in i) {
      var l = !!i[u];
      (s == null || l !== !!s[u]) && e.classList.toggle(u, l);
    }
  return i;
}
const Is = Symbol("is custom element"),
  $s = Symbol("is html");
function Cs(e, t, n, r) {
  var s = Ns(e);
  s[t] !== (s[t] = n) && (n == null ? e.removeAttribute(t) : typeof n != "string" && Ps(e).includes(t) ? (e[t] = n) : e.setAttribute(t, n));
}
function Ns(e) {
  return (e.__attributes ??= { [Is]: e.nodeName.includes("-"), [$s]: e.namespaceURI === Cr });
}
var Tn = new Map();
function Ps(e) {
  var t = e.getAttribute("is") || e.nodeName,
    n = Tn.get(t);
  if (n) return n;
  Tn.set(t, (n = []));
  for (var r, s = e, i = Element.prototype; i !== s; ) {
    r = Pn(s);
    for (var a in r) r[a].set && n.push(a);
    s = Zt(s);
  }
  return n;
}
function Ls(e, t, n = t) {
  (ls(e, "change", (r) => {
    var s = r ? e.defaultChecked : e.checked;
    n(s);
  }),
    z(t) == null && n(e.checked),
    un(() => {
      var r = t();
      e.checked = !!r;
    }));
}
function Pe(e = !1) {
  const t = P,
    n = t.l.u;
  if (!n) return;
  let r = () => dr(t.s);
  if (e) {
    let s = 0,
      i = {};
    const a = It(() => {
      let o = !1;
      const u = t.s;
      for (const l in u) u[l] !== i[l] && ((i[l] = u[l]), (o = !0));
      return (o && s++, s);
    });
    r = () => p(a);
  }
  (n.b.length &&
    fs(() => {
      (Sn(t, r), gt(n.b));
    }),
    Ht(() => {
      const s = z(() => n.m.map(Mr));
      return () => {
        for (const i of s) typeof i == "function" && i();
      };
    }),
    n.a.length &&
      Ht(() => {
        (Sn(t, r), gt(n.a));
      }));
}
function Sn(e, t) {
  if (e.l.s) for (const n of e.l.s) p(n);
  t();
}
function An(e, t) {
  var n = e.$$events?.[t.type],
    r = St(n) ? n.slice() : n == null ? [] : [n];
  for (var s of r) s.call(this, t);
}
function vn(e, t, n) {
  if (e == null) return (t(void 0), n && n(void 0), Oe);
  const r = z(() => e.subscribe(t, n));
  return r.unsubscribe ? () => r.unsubscribe() : r;
}
const He = [];
function _r(e, t) {
  return { subscribe: Ct(e, t).subscribe };
}
function Ct(e, t = Oe) {
  let n = null;
  const r = new Set();
  function s(o) {
    if (Bn(e, o) && ((e = o), n)) {
      const u = !He.length;
      for (const l of r) (l[1](), He.push(l, e));
      if (u) {
        for (let l = 0; l < He.length; l += 2) He[l][0](He[l + 1]);
        He.length = 0;
      }
    }
  }
  function i(o) {
    s(o(e));
  }
  function a(o, u = Oe) {
    const l = [o, u];
    return (
      r.add(l),
      r.size === 1 && (n = t(s, i) || Oe),
      o(e),
      () => {
        (r.delete(l), r.size === 0 && n && (n(), (n = null)));
      }
    );
  }
  return { set: s, update: i, subscribe: a };
}
function Nt(e, t, n) {
  const r = !Array.isArray(e),
    s = r ? [e] : e;
  if (!s.every(Boolean)) throw new Error("derived() expects stores as input, got a falsy value");
  const i = t.length < 2;
  return _r(n, (a, o) => {
    let u = !1;
    const l = [];
    let d = 0,
      v = Oe;
    const f = () => {
        if (d) return;
        v();
        const c = t(r ? l[0] : l, a, o);
        i ? a(c) : (v = typeof c == "function" ? c : Oe);
      },
      h = s.map((c, y) =>
        vn(
          c,
          (T) => {
            ((l[y] = T), (d &= ~(1 << y)), u && f());
          },
          () => {
            d |= 1 << y;
          },
        ),
      );
    return (
      (u = !0),
      f(),
      function () {
        (gt(h), v(), (u = !1));
      }
    );
  });
}
function gr(e) {
  let t;
  return (vn(e, (n) => (t = n))(), t);
}
let pt = !1,
  Wt = Symbol();
function pe(e, t, n) {
  const r = (n[t] ??= { store: null, source: j(void 0), unsubscribe: Oe });
  if (r.store !== e && !(Wt in n))
    if ((r.unsubscribe(), (r.store = e ?? null), e == null)) ((r.source.v = void 0), (r.unsubscribe = Oe));
    else {
      var s = !0;
      ((r.unsubscribe = vn(e, (i) => {
        s ? (r.source.v = i) : E(r.source, i);
      })),
        (s = !1));
    }
  return e && Wt in n ? gr(e) : p(r.source);
}
function dt() {
  const e = {};
  function t() {
    on(() => {
      for (var n in e) e[n].unsubscribe();
      Nn(e, Wt, { enumerable: !1, value: !0 });
    });
  }
  return [e, t];
}
function Ms(e) {
  var t = pt;
  try {
    return ((pt = !1), [e(), pt]);
  } finally {
    pt = t;
  }
}
const Ds = {
  get(e, t) {
    let n = e.props.length;
    for (; n--; ) {
      let r = e.props[n];
      if ((tt(r) && (r = r()), typeof r == "object" && r !== null && t in r)) return r[t];
    }
  },
  set(e, t, n) {
    let r = e.props.length;
    for (; r--; ) {
      let s = e.props[r];
      tt(s) && (s = s());
      const i = Ke(s, t);
      if (i && i.set) return (i.set(n), !0);
    }
    return !1;
  },
  getOwnPropertyDescriptor(e, t) {
    let n = e.props.length;
    for (; n--; ) {
      let r = e.props[n];
      if ((tt(r) && (r = r()), typeof r == "object" && r !== null && t in r)) {
        const s = Ke(r, t);
        return (s && !s.configurable && (s.configurable = !0), s);
      }
    }
  },
  has(e, t) {
    if (t === Me || t === qn) return !1;
    for (let n of e.props) if ((tt(n) && (n = n()), n != null && t in n)) return !0;
    return !1;
  },
  ownKeys(e) {
    const t = [];
    for (let n of e.props)
      if ((tt(n) && (n = n()), !!n)) {
        for (const r in n) t.includes(r) || t.push(r);
        for (const r of Object.getOwnPropertySymbols(n)) t.includes(r) || t.push(r);
      }
    return t;
  },
};
function xn(...e) {
  return new Proxy({ props: e }, Ds);
}
function Ft(e, t, n, r) {
  var s = !Ze || (n & Ar) !== 0,
    i = (n & Or) !== 0,
    a = (n & Rr) !== 0,
    o = r,
    u = !0,
    l = () => (u && ((u = !1), (o = a ? z(r) : r)), o),
    d;
  if (i) {
    var v = Me in e || qn in e;
    d = Ke(e, t)?.set ?? (v && t in e ? (_) => (e[t] = _) : void 0);
  }
  var f,
    h = !1;
  (i ? ([f, h] = Ms(() => e[t])) : (f = e[t]), f === void 0 && r !== void 0 && ((f = l()), d && (s && Hr(), d(f))));
  var c;
  if (
    (s
      ? (c = () => {
          var _ = e[t];
          return _ === void 0 ? l() : ((u = !0), _);
        })
      : (c = () => {
          var _ = e[t];
          return (_ !== void 0 && (o = void 0), _ === void 0 ? o : _);
        }),
    s && (n & xr) === 0)
  )
    return c;
  if (d) {
    var y = e.$$legacy;
    return function (_, w) {
      return arguments.length > 0 ? ((!s || !w || y || h) && d(w ? c() : _), _) : c();
    };
  }
  var T = !1,
    k = ((n & Sr) !== 0 ? It : rn)(() => ((T = !1), c()));
  i && p(k);
  var S = N;
  return function (_, w) {
    if (arguments.length > 0) {
      const b = w ? p(k) : s && i ? Je(_) : _;
      return (E(k, b), (T = !0), o !== void 0 && (o = b), _);
    }
    return (je && T) || (S.f & ce) !== 0 ? k.v : p(k);
  };
}
function qs(e, t) {
  if (e instanceof RegExp) return { keys: !1, pattern: e };
  var n,
    r,
    s,
    i,
    a = [],
    o = "",
    u = e.split("/");
  for (u[0] || u.shift(); (s = u.shift()); )
    ((n = s[0]),
      n === "*"
        ? (a.push("wild"), (o += "/(.*)"))
        : n === ":"
          ? ((r = s.indexOf("?", 1)),
            (i = s.indexOf(".", 1)),
            a.push(s.substring(1, ~r ? r : ~i ? i : s.length)),
            (o += ~r && !~i ? "(?:/([^/]+?))?" : "/([^/]+?)"),
            ~i && (o += (~r ? "?" : "") + "\\" + s.substring(i)))
          : (o += "/" + s));
  return { keys: a, pattern: new RegExp("^" + o + "/?$", "i") };
}
function On() {
  const e = window.location.href.indexOf("#/");
  let t = e > -1 ? window.location.href.substr(e + 1) : "/";
  const n = t.indexOf("?");
  let r = "";
  return (n > -1 && ((r = t.substr(n + 1)), (t = t.substr(0, n))), { location: t, querystring: r });
}
const hn = _r(null, function (t) {
  t(On());
  const n = () => {
    t(On());
  };
  return (
    window.addEventListener("hashchange", n, !1),
    function () {
      window.removeEventListener("hashchange", n, !1);
    }
  );
});
Nt(hn, (e) => e.location);
Nt(hn, (e) => e.querystring);
const Rn = Ct(void 0);
async function Pt(e) {
  if (!e || e.length < 1 || (e.charAt(0) != "/" && e.indexOf("#/") !== 0)) throw Error("Invalid parameter location");
  (await ur(),
    history.replaceState(
      { ...history.state, __svelte_spa_router_scrollX: window.scrollX, __svelte_spa_router_scrollY: window.scrollY },
      void 0,
    ),
    (window.location.hash = (e.charAt(0) == "#" ? "" : "#") + e));
}
function Se(e, t) {
  if (((t = $n(t)), !e || !e.tagName || e.tagName.toLowerCase() != "a")) throw Error('Action "link" can only be used with <a> tags');
  return (
    In(e, t),
    {
      update(n) {
        ((n = $n(n)), In(e, n));
      },
    }
  );
}
function Fs(e) {
  e ? window.scrollTo(e.__svelte_spa_router_scrollX, e.__svelte_spa_router_scrollY) : window.scrollTo(0, 0);
}
function In(e, t) {
  let n = t.href || e.getAttribute("href");
  if (n && n.charAt(0) == "/") n = "#" + n;
  else if (!n || n.length < 2 || n.slice(0, 2) != "#/") throw Error('Invalid value for "href" attribute: ' + n);
  (e.setAttribute("href", n),
    e.addEventListener("click", (r) => {
      (r.preventDefault(), t.disabled || Bs(r.currentTarget.getAttribute("href")));
    }));
}
function $n(e) {
  return e && typeof e == "string" ? { href: e } : e || {};
}
function Bs(e) {
  (history.replaceState(
    { ...history.state, __svelte_spa_router_scrollX: window.scrollX, __svelte_spa_router_scrollY: window.scrollY },
    void 0,
  ),
    (window.location.hash = e));
}
function js(e, t) {
  Ce(t, !1);
  let n = Ft(t, "routes", 24, () => ({})),
    r = Ft(t, "prefix", 8, ""),
    s = Ft(t, "restoreScrollState", 8, !1);
  class i {
    constructor(g, m) {
      if (!m || (typeof m != "function" && (typeof m != "object" || m._sveltesparouter !== !0))) throw Error("Invalid component object");
      if (
        !g ||
        (typeof g == "string" && (g.length < 1 || (g.charAt(0) != "/" && g.charAt(0) != "*"))) ||
        (typeof g == "object" && !(g instanceof RegExp))
      )
        throw Error('Invalid value for "path" argument - strings must start with / or *');
      const { pattern: R, keys: C } = qs(g);
      ((this.path = g),
        typeof m == "object" && m._sveltesparouter === !0
          ? ((this.component = m.component),
            (this.conditions = m.conditions || []),
            (this.userData = m.userData),
            (this.props = m.props || {}))
          : ((this.component = () => Promise.resolve(m)), (this.conditions = []), (this.props = {})),
        (this._pattern = R),
        (this._keys = C));
    }
    match(g) {
      if (r()) {
        if (typeof r() == "string")
          if (g.startsWith(r())) g = g.substr(r().length) || "/";
          else return null;
        else if (r() instanceof RegExp) {
          const D = g.match(r());
          if (D && D[0]) g = g.substr(D[0].length) || "/";
          else return null;
        }
      }
      const m = this._pattern.exec(g);
      if (m === null) return null;
      if (this._keys === !1) return m;
      const R = {};
      let C = 0;
      for (; C < this._keys.length; ) {
        try {
          R[this._keys[C]] = decodeURIComponent(m[C + 1] || "") || null;
        } catch {
          R[this._keys[C]] = null;
        }
        C++;
      }
      return R;
    }
    async checkConditions(g) {
      for (let m = 0; m < this.conditions.length; m++) if (!(await this.conditions[m](g))) return !1;
      return !0;
    }
  }
  const a = [];
  n() instanceof Map
    ? n().forEach((b, g) => {
        a.push(new i(g, b));
      })
    : Object.keys(n()).forEach((b) => {
        a.push(new i(b, n()[b]));
      });
  let o = j(null),
    u = j(null),
    l = j({});
  const d = Ts();
  async function v(b, g) {
    (await ur(), d(b, g));
  }
  let f = null,
    h = null;
  s() &&
    ((h = (b) => {
      b.state && (b.state.__svelte_spa_router_scrollY || b.state.__svelte_spa_router_scrollX) ? (f = b.state) : (f = null);
    }),
    window.addEventListener("popstate", h),
    Ss(() => {
      Fs(f);
    }));
  let c = null,
    y = null;
  const T = hn.subscribe(async (b) => {
    c = b;
    let g = 0;
    for (; g < a.length; ) {
      const m = a[g].match(b.location);
      if (!m) {
        g++;
        continue;
      }
      const R = {
        route: a[g].path,
        location: b.location,
        querystring: b.querystring,
        userData: a[g].userData,
        params: m && typeof m == "object" && Object.keys(m).length ? m : null,
      };
      if (!(await a[g].checkConditions(R))) {
        (E(o, null), (y = null), v("conditionsFailed", R));
        return;
      }
      v("routeLoading", Object.assign({}, R));
      const C = a[g].component;
      if (y != C) {
        C.loading
          ? (E(o, C.loading),
            (y = C),
            E(u, C.loadingParams),
            E(l, {}),
            v("routeLoaded", Object.assign({}, R, { component: p(o), name: p(o).name, params: p(u) })))
          : (E(o, null), (y = null));
        const D = await C();
        if (b != c) return;
        (E(o, (D && D.default) || D), (y = C));
      }
      (m && typeof m == "object" && Object.keys(m).length ? E(u, m) : E(u, null),
        E(l, a[g].props),
        v("routeLoaded", Object.assign({}, R, { component: p(o), name: p(o).name, params: p(u) })).then(() => {
          Rn.set(p(u));
        }));
      return;
    }
    (E(o, null), (y = null), Rn.set(void 0));
  });
  (ks(() => {
    (T(), h && window.removeEventListener("popstate", h));
  }),
    an(
      () => dr(s()),
      () => {
        history.scrollRestoration = s() ? "manual" : "auto";
      },
    ),
    ln(),
    Pe());
  var k = _t(),
    S = de(k);
  {
    var _ = (b) => {
        var g = _t(),
          m = de(g);
        (kn(
          m,
          () => p(o),
          (R, C) => {
            C(
              R,
              xn(
                {
                  get params() {
                    return p(u);
                  },
                },
                () => p(l),
                {
                  $$events: {
                    routeEvent(D) {
                      An.call(this, t, D);
                    },
                  },
                },
              ),
            );
          },
        ),
          x(b, g));
      },
      w = (b) => {
        var g = _t(),
          m = de(g);
        (kn(
          m,
          () => p(o),
          (R, C) => {
            C(
              R,
              xn(() => p(l), {
                $$events: {
                  routeEvent(D) {
                    An.call(this, t, D);
                  },
                },
              }),
            );
          },
        ),
          x(b, g));
      };
    te(S, (b) => {
      p(u) ? b(_) : b(w, !1);
    });
  }
  (x(e, k), Ne());
}
function Us() {
  const {
    subscribe: e,
    set: t,
    update: n,
  } = Ct({ accessToken: null, idToken: null, refreshToken: null, userInfo: null, isAuthenticated: !1 });
  if (typeof window < "u") {
    const r = localStorage.getItem("cognitoAccessToken"),
      s = localStorage.getItem("cognitoIdToken"),
      i = localStorage.getItem("cognitoRefreshToken"),
      a = localStorage.getItem("userInfo");
    r && a && t({ accessToken: r, idToken: s, refreshToken: i, userInfo: JSON.parse(a), isAuthenticated: !0 });
  }
  return {
    subscribe: e,
    login: (r, s) => {
      (typeof window < "u" &&
        (localStorage.setItem("cognitoAccessToken", r.accessToken),
        localStorage.setItem("cognitoIdToken", r.idToken),
        r.refreshToken && localStorage.setItem("cognitoRefreshToken", r.refreshToken),
        localStorage.setItem("userInfo", JSON.stringify(s))),
        t({ ...r, userInfo: s, isAuthenticated: !0 }));
    },
    logout: () => {
      (typeof window < "u" &&
        (localStorage.removeItem("cognitoAccessToken"),
        localStorage.removeItem("cognitoIdToken"),
        localStorage.removeItem("cognitoRefreshToken"),
        localStorage.removeItem("userInfo")),
        t({ accessToken: null, idToken: null, refreshToken: null, userInfo: null, isAuthenticated: !1 }));
    },
    updateTokens: (r) => {
      n(
        (s) => (
          typeof window < "u" &&
            (localStorage.setItem("cognitoAccessToken", r.accessToken),
            localStorage.setItem("cognitoIdToken", r.idToken),
            r.refreshToken && localStorage.setItem("cognitoRefreshToken", r.refreshToken)),
          { ...s, ...r }
        ),
      );
    },
  };
}
const _e = Us(),
  Vs = Nt(_e, (e) => e.userInfo?.name || e.userInfo?.email || "User");
function Hs() {
  const { subscribe: e, set: t, update: n } = Ct([]);
  return {
    subscribe: e,
    set: t,
    add: (r) => n((s) => [...s, r]),
    remove: (r) => n((s) => s.filter((i) => i.product !== r)),
    refresh: async (r) => {
      try {
        const s = await fetch("/api/account/bundles", { headers: { Authorization: `Bearer ${r}` } });
        if (s.ok) {
          const i = await s.json();
          t(i.bundles || []);
        }
      } catch (s) {
        console.error("Failed to fetch bundles:", s);
      }
    },
  };
}
const xe = Hs();
Nt(xe, (e) => (t) => e.some((n) => n.product === t));
var Ys = O('<span class="login-status"> </span> <button class="login-link">Log out</button>', 1),
  zs = O('<span class="login-status">Not logged in</span> <a href="/auth/login" class="login-link">Log in</a>', 1),
  Js = O(
    '<header><div class="header-nav"><div class="hamburger-menu"><button class="hamburger-btn">☰</button> <div><a href="/">Home</a> <a href="/account/bundles">Bundles</a> <a href="/hmrc/receipt/receipts">Receipts</a> <a href="/guide">User Guide</a> <a href="/about">About</a></div></div> <div class="auth-section"><span class="entitlement-status"> </span> <!></div></div> <h1>DIY Accounting Submit</h1> <p class="subtitle">Submit UK VAT returns to HMRC under Making Tax Digital (MTD)</p></header>',
  );
function Ks(e, t) {
  Ce(t, !1);
  const n = () => pe(xe, "$bundlesStore", i),
    r = () => pe(_e, "$authStore", i),
    s = () => pe(Vs, "$userName", i),
    [i, a] = dt(),
    o = j();
  let u = j(!1);
  function l() {
    E(u, !p(u));
  }
  function d() {
    E(u, !1);
  }
  function v() {
    (_e.logout(), d());
  }
  (an(
    () => n(),
    () => {
      E(o, n().length > 0 ? `Bundles: ${n().length}` : "Activity: unrestricted");
    },
  ),
    ln(),
    Pe());
  var f = Js(),
    h = A(f),
    c = A(h),
    y = A(c),
    T = I(y, 2);
  let k;
  var S = A(T);
  (Te(S, (M) => Se?.(M)), Ye(() => ie("click", S, d)));
  var _ = I(S, 2);
  (Te(_, (M) => Se?.(M)), Ye(() => ie("click", _, d)));
  var w = I(_, 2);
  (Te(w, (M) => Se?.(M)), Ye(() => ie("click", w, d)));
  var b = I(w, 2);
  (Te(b, (M) => Se?.(M)), Ye(() => ie("click", b, d)));
  var g = I(b, 2);
  (Te(g, (M) => Se?.(M)), Ye(() => ie("click", g, d)));
  var m = I(c, 2),
    R = A(m),
    C = A(R),
    D = I(R, 2);
  {
    var q = (M) => {
        var F = Ys(),
          se = de(F),
          we = A(se),
          Ue = I(se, 2);
        (le(() => K(we, `Logged in as ${s() ?? ""}`)), ie("click", Ue, v), x(M, F));
      },
      H = (M) => {
        var F = zs(),
          se = I(de(F), 2);
        (Te(se, (we) => Se?.(we)), x(M, F));
      };
    te(D, (M) => {
      (r(), z(() => r().isAuthenticated) ? M(q) : M(H, !1));
    });
  }
  (le(() => {
    ((k = pr(T, 1, "menu-dropdown", null, k, { show: p(u) })), K(C, p(o)));
  }),
    ie("click", y, l),
    x(e, f),
    Ne(),
    a());
}
var Gs = O(
  '<footer class="svelte-qbclve"><div class="footer-content svelte-qbclve"><div class="footer-left svelte-qbclve"><a href="/tests/index.html" target="_blank" class="svelte-qbclve">tests</a> <a href="/docs/index.html" target="_blank" class="svelte-qbclve">api</a></div> <div class="footer-center svelte-qbclve"><p>&copy; 2025 DIY Accounting Limited</p></div> <div class="footer-right svelte-qbclve"><span class="version svelte-qbclve"> </span></div></div></footer>',
);
function Ws(e, t) {
  Ce(t, !1);
  const n = "0.0.2-4";
  Pe();
  var r = Gs(),
    s = A(r),
    i = I(A(s), 4),
    a = A(i),
    o = A(a);
  (le(() => K(o, `v${n}`)), x(e, r), Ne());
}
class Xs {
  constructor() {
    this.baseUrl = "";
  }
  async request(t, n = {}) {
    const r = gr(_e),
      s = { "Content-Type": "application/json", ...n.headers };
    r.isAuthenticated && r.accessToken && (s.Authorization = `Bearer ${r.accessToken}`);
    try {
      const i = await fetch(t, { ...n, headers: s });
      if (!i.ok) {
        const a = await i.json().catch(() => ({ message: i.statusText }));
        throw new Error(a.message || `HTTP ${i.status}`);
      }
      return await i.json();
    } catch (i) {
      throw (console.error("API request failed:", t, i), i);
    }
  }
  async getCognitoAuthUrl() {
    return this.request("/api/auth/cognito/authurl");
  }
  async exchangeCognitoToken(t, n) {
    return this.request("/api/auth/cognito/token", { method: "POST", body: JSON.stringify({ code: t, state: n }) });
  }
  async getHmrcAuthUrl(t = "prod") {
    return this.request(`/api/hmrc/authurl?account=${t}`);
  }
  async exchangeHmrcToken(t, n, r = "prod") {
    return this.request("/api/hmrc/token", { method: "POST", body: JSON.stringify({ code: t, state: n, account: r }) });
  }
  async getVatObligations(t, n = "prod") {
    return this.request(`/api/hmrc/vat/obligations?vrn=${t}&account=${n}`);
  }
  async getVatReturn(t, n, r = "prod") {
    return this.request(`/api/hmrc/vat/returns?vrn=${t}&periodKey=${n}&account=${r}`);
  }
  async submitVatReturn(t, n, r, s = "prod") {
    return this.request("/api/hmrc/vat/returns", {
      method: "POST",
      body: JSON.stringify({ vrn: t, periodKey: n, vatReturn: r, account: s }),
    });
  }
  async getReceipts() {
    return this.request("/api/hmrc/receipts");
  }
  async getReceipt(t) {
    return this.request(`/api/hmrc/receipts?receiptId=${t}`);
  }
  async getBundles() {
    return this.request("/api/account/bundles");
  }
  async addBundle(t) {
    return this.request("/api/account/bundles", { method: "POST", body: JSON.stringify({ product: t }) });
  }
  async removeBundle(t) {
    return this.request("/api/account/bundles", { method: "DELETE", body: JSON.stringify({ product: t }) });
  }
  async getCatalog() {
    return this.request("/api/account/catalog");
  }
}
const oe = new Xs();
var Zs = O('<span class="badge badge-restricted svelte-c3h0pg">Bundle Required</span>'),
  Qs = O('<a><h3 class="svelte-c3h0pg"> </h3> <p class="svelte-c3h0pg"> </p> <!></a>'),
  ei = O(
    '<div class="activities-grid svelte-c3h0pg"></div> <div class="add-service-section svelte-c3h0pg"><p style="margin-bottom: 1em; color: #666; font-style: italic">Need more choices? Select additional bundles to expand your available activities.</p> <a href="/account/bundles" class="btn btn-success svelte-c3h0pg">Add Bundle</a></div>',
    1,
  ),
  ti = O('<div class="form-container" style="text-align: center"><h2>Select an activity to continue:</h2> <!></div>');
function ni(e, t) {
  Ce(t, !1);
  const n = () => pe(_e, "$authStore", s),
    r = () => pe(xe, "$bundlesStore", s),
    [s, i] = dt();
  let a = [],
    o = j([]);
  ct(async () => {
    if (n().isAuthenticated)
      try {
        const f = await oe.getBundles();
        xe.set(f.bundles || []);
      } catch (f) {
        console.error("Failed to fetch bundles:", f);
      }
    try {
      ((a = (await oe.getCatalog()).products || []),
        E(o, [
          {
            id: "vat-obligations",
            name: "View VAT Obligations",
            description: "Check your VAT filing obligations from HMRC",
            path: "/hmrc/vat/vatObligations",
            requiredBundle: null,
          },
          {
            id: "submit-vat",
            name: "Submit VAT Return",
            description: "Submit a VAT return to HMRC",
            path: "/hmrc/vat/submitVat",
            requiredBundle: null,
          },
          {
            id: "view-receipts",
            name: "View Receipts",
            description: "View your HMRC submission receipts",
            path: "/hmrc/receipt/receipts",
            requiredBundle: null,
          },
        ]));
    } catch (f) {
      console.error("Failed to fetch catalog:", f);
    }
  });
  function u(f) {
    return f.requiredBundle ? r().some((h) => h.product === f.requiredBundle) : !0;
  }
  Pe();
  var l = ti(),
    d = I(A(l), 2);
  {
    var v = (f) => {
      var h = ei(),
        c = de(h);
      Gt(
        c,
        5,
        () => p(o),
        Jt,
        (k, S) => {
          var _ = Qs();
          let w;
          var b = A(_),
            g = A(b),
            m = I(b, 2),
            R = A(m),
            C = I(m, 2);
          {
            var D = (q) => {
              var H = Zs();
              x(q, H);
            };
            te(C, (q) => {
              u(p(S)) || q(D);
            });
          }
          (Te(_, (q) => Se?.(q)),
            le(
              (q) => {
                (Cs(_, "href", p(S).path),
                  (w = pr(_, 1, "activity-card svelte-c3h0pg", null, w, q)),
                  K(g, p(S).name),
                  K(R, p(S).description));
              },
              [() => ({ disabled: !u(p(S)) })],
            ),
            x(k, _));
        },
      );
      var y = I(c, 2),
        T = I(A(y), 2);
      (Te(T, (k) => Se?.(k)), x(f, h));
    };
    te(d, (f) => {
      f(v, !1);
    });
  }
  (x(e, l), Ne(), i());
}
var ri = O('<div class="alert alert-error svelte-5cb1k4"> </div>'),
  si = O(
    '<div class="form-container"><h2>Log in to DIY Accounting Submit</h2> <p style="margin-bottom: 2em; color: #666">You need to log in to submit VAT returns and access your account.</p> <!> <div class="login-options svelte-5cb1k4"><button class="btn btn-primary btn-large svelte-5cb1k4"> </button> <div class="divider svelte-5cb1k4">or</div> <label class="checkbox-label svelte-5cb1k4"><input type="checkbox"/> Use mock authentication (for testing)</label></div></div>',
  );
function ii(e, t) {
  Ce(t, !1);
  const n = () => pe(_e, "$authStore", r),
    [r, s] = dt();
  let i = j(!1),
    a = j(!1),
    o = j(null);
  ct(() => {
    n().isAuthenticated && Pt("/");
  });
  async function u() {
    (E(a, !0), E(o, null));
    try {
      const k = p(i) ? await fetch("/api/auth/mock/authurl").then((S) => S.json()) : await oe.getCognitoAuthUrl();
      k.authUrl ? (window.location.href = k.authUrl) : E(o, "Failed to get authorization URL");
    } catch (k) {
      (console.error("Login error:", k), E(o, k.message || "An error occurred during login"));
    } finally {
      E(a, !1);
    }
  }
  Pe();
  var l = si(),
    d = I(A(l), 4);
  {
    var v = (k) => {
      var S = ri(),
        _ = A(S);
      (le(() => K(_, p(o))), x(k, S));
    };
    te(d, (k) => {
      p(o) && k(v);
    });
  }
  var f = I(d, 2),
    h = A(f),
    c = A(h),
    y = I(h, 4),
    T = A(y);
  (le(() => {
    ((h.disabled = p(a)), K(c, p(a) ? "Redirecting..." : "Log in with Cognito"));
  }),
    ie("click", h, u),
    Ls(
      T,
      () => p(i),
      (k) => E(i, k),
    ),
    x(e, l),
    Ne(),
    s());
}
var oi = O(
    '<h2 class="svelte-ted0p7">Completing login...</h2> <div class="loading-spinner svelte-ted0p7"><div class="spinner svelte-ted0p7"></div> <p class="svelte-ted0p7">Please wait while we complete your authentication</p></div>',
    1,
  ),
  ai = O(
    '<h2 class="svelte-ted0p7">Authentication Error</h2> <div class="alert alert-error svelte-ted0p7"> </div> <a href="/auth/login" class="btn btn-primary svelte-ted0p7">Try Again</a>',
    1,
  ),
  li = O('<h2 class="svelte-ted0p7">Login Successful!</h2> <p class="svelte-ted0p7">Redirecting to home page...</p>', 1),
  ui = O('<div class="form-container svelte-ted0p7" style="text-align: center"><!></div>');
function Cn(e, t) {
  Ce(t, !1);
  let n = j(!0),
    r = j(null);
  (ct(async () => {
    const u = new URLSearchParams(window.location.search),
      l = u.get("code"),
      d = u.get("state"),
      v = window.location.pathname.includes("Mock");
    if (!l) {
      (E(r, "No authorization code received"), E(n, !1));
      return;
    }
    try {
      const f = v
        ? await fetch("/api/auth/mock/token", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ code: l, state: d }),
          }).then((h) => h.json())
        : await oe.exchangeCognitoToken(l, d);
      if (f.accessToken && f.idToken) {
        const c = f.idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"),
          y = JSON.parse(
            decodeURIComponent(
              atob(c)
                .split("")
                .map((T) => "%" + ("00" + T.charCodeAt(0).toString(16)).slice(-2))
                .join(""),
            ),
          );
        (_e.login({ accessToken: f.accessToken, idToken: f.idToken, refreshToken: f.refreshToken }, y), Pt("/"));
      } else E(r, "Invalid response from authentication server");
    } catch (f) {
      (console.error("Token exchange error:", f), E(r, f.message || "Failed to complete authentication"));
    } finally {
      E(n, !1);
    }
  }),
    Pe());
  var s = ui(),
    i = A(s);
  {
    var a = (u) => {
        var l = oi();
        x(u, l);
      },
      o = (u) => {
        var l = _t(),
          d = de(l);
        {
          var v = (h) => {
              var c = ai(),
                y = I(de(c), 2),
                T = A(y);
              (le(() => K(T, p(r))), x(h, c));
            },
            f = (h) => {
              var c = li();
              x(h, c);
            };
          te(
            d,
            (h) => {
              p(r) ? h(v) : h(f, !1);
            },
            !0,
          );
        }
        x(u, l);
      };
    te(i, (u) => {
      p(n) ? u(a) : u(o, !1);
    });
  }
  (x(e, s), Ne());
}
var fi = O('<div class="alert alert-error svelte-21gh8k"> </div>'),
  ci = O('<div class="loading-spinner svelte-21gh8k">Loading bundles...</div>'),
  di = O(
    '<div class="bundle-card active svelte-21gh8k"><div class="bundle-info svelte-21gh8k"><h4 class="svelte-21gh8k"> </h4> <p class="svelte-21gh8k"> </p> <p class="svelte-21gh8k"> </p></div> <button class="btn btn-danger btn-small svelte-21gh8k">Remove</button></div>',
  ),
  vi = O('<div class="bundles-list svelte-21gh8k"></div>'),
  hi = O(`<p class="no-bundles svelte-21gh8k">You don't have any active bundles.</p>`),
  pi = O('<span class="badge badge-active svelte-21gh8k">Active</span>'),
  _i = O('<button class="btn btn-primary btn-small svelte-21gh8k">Add Bundle</button>'),
  gi = O(
    '<div class="bundle-card svelte-21gh8k"><div class="bundle-info svelte-21gh8k"><h4 class="svelte-21gh8k"> </h4> <p class="svelte-21gh8k"> </p></div> <!></div>',
  ),
  mi = O(
    '<div class="bundles-section svelte-21gh8k"><h3 class="svelte-21gh8k">Your Active Bundles</h3> <!></div> <div class="bundles-section svelte-21gh8k"><h3 class="svelte-21gh8k">Available Bundles</h3> <div class="bundles-list svelte-21gh8k"></div></div>',
    1,
  ),
  bi = O(
    '<div class="form-container"><h2>Manage Your Bundles</h2> <p style="margin-bottom: 2em; color: #666">Bundles give you access to additional features and activities.</p> <!> <!></div>',
  );
function wi(e, t) {
  Ce(t, !1);
  const n = () => pe(xe, "$bundlesStore", s),
    r = () => pe(_e, "$authStore", s),
    [s, i] = dt();
  let a = j(!0),
    o = j(null),
    u = j([]),
    l = j(n());
  ct(async () => {
    if (!r().isAuthenticated) {
      Pt("/auth/login");
      return;
    }
    try {
      const [_, w] = await Promise.all([oe.getCatalog(), oe.getBundles()]);
      (E(u, _.products || []), xe.set(w.bundles || []));
    } catch (_) {
      (console.error("Failed to load bundles:", _), E(o, _.message));
    } finally {
      E(a, !1);
    }
  });
  async function d(_) {
    try {
      await oe.addBundle(_);
      const w = await oe.getBundles();
      xe.set(w.bundles || []);
    } catch (w) {
      (console.error("Failed to add bundle:", w), E(o, w.message));
    }
  }
  async function v(_) {
    if (confirm("Are you sure you want to remove this bundle?"))
      try {
        await oe.removeBundle(_);
        const w = await oe.getBundles();
        xe.set(w.bundles || []);
      } catch (w) {
        (console.error("Failed to remove bundle:", w), E(o, w.message));
      }
  }
  function f(_) {
    return p(l).some((w) => w.product === _);
  }
  (an(
    () => n(),
    () => {
      E(l, n());
    },
  ),
    ln(),
    Pe());
  var h = bi(),
    c = I(A(h), 4);
  {
    var y = (_) => {
      var w = fi(),
        b = A(w);
      (le(() => K(b, p(o))), x(_, w));
    };
    te(c, (_) => {
      p(o) && _(y);
    });
  }
  var T = I(c, 2);
  {
    var k = (_) => {
        var w = ci();
        x(_, w);
      },
      S = (_) => {
        var w = mi(),
          b = de(w),
          g = I(A(b), 2);
        {
          var m = (q) => {
              var H = vi();
              (Gt(
                H,
                5,
                () => p(l),
                Jt,
                (M, F) => {
                  var se = di(),
                    we = A(se),
                    Ue = A(we),
                    Lt = A(Ue),
                    vt = I(Ue, 2),
                    Mt = A(vt),
                    Dt = I(vt, 2),
                    ye = A(Dt),
                    Ve = I(we, 2);
                  (le(
                    (mr) => {
                      (K(Lt, (p(F), z(() => p(F).productName || p(F).product))),
                        K(Mt, `Expires: ${mr ?? ""}`),
                        K(ye, `User limit: ${(p(F), z(() => p(F).userLimit) ?? "")}`));
                    },
                    [() => (p(F), z(() => new Date(p(F).expiryDate).toLocaleDateString()))],
                  ),
                    ie("click", Ve, () => v(p(F).product)),
                    x(M, se));
                },
              ),
                x(q, H));
            },
            R = (q) => {
              var H = hi();
              x(q, H);
            };
          te(g, (q) => {
            (p(l), z(() => p(l).length > 0) ? q(m) : q(R, !1));
          });
        }
        var C = I(b, 2),
          D = I(A(C), 2);
        (Gt(
          D,
          5,
          () => p(u),
          Jt,
          (q, H) => {
            var M = gi(),
              F = A(M),
              se = A(F),
              we = A(se),
              Ue = I(se, 2),
              Lt = A(Ue),
              vt = I(F, 2);
            {
              var Mt = (ye) => {
                  var Ve = pi();
                  x(ye, Ve);
                },
                Dt = (ye) => {
                  var Ve = _i();
                  (ie("click", Ve, () => d(p(H).id)), x(ye, Ve));
                };
              te(vt, (ye) => {
                (p(H), z(() => f(p(H).id)) ? ye(Mt) : ye(Dt, !1));
              });
            }
            (le(() => {
              (K(we, (p(H), z(() => p(H).name))), K(Lt, (p(H), z(() => p(H).description || "No description"))));
            }),
              x(q, M));
          },
        ),
          x(_, w));
      };
    te(T, (_) => {
      p(a) ? _(k) : _(S, !1);
    });
  }
  (x(e, h), Ne(), i());
}
var yi = O(
  '<div class="form-container"><h2>VAT Obligations</h2> <p>View your VAT obligations from HMRC. This feature is under development.</p></div>',
);
function ki(e, t) {
  Ce(t, !1);
  const n = () => pe(_e, "$authStore", r),
    [r, s] = dt();
  (n().isAuthenticated || Pt("/auth/login"), Pe());
  var i = yi();
  (x(e, i), Ne(), s());
}
var Ei = O('<div class="form-container"><h2>SubmitVat</h2> <p>This page is under development.</p></div>');
function Ti(e) {
  var t = Ei();
  x(e, t);
}
var Si = O('<div class="form-container"><h2>ViewVatReturn</h2> <p>This page is under development.</p></div>');
function Ai(e) {
  var t = Si();
  x(e, t);
}
var xi = O('<div class="form-container"><h2>Receipts</h2> <p>This page is under development.</p></div>');
function Oi(e) {
  var t = xi();
  x(e, t);
}
var Ri = O('<div class="form-container"><h2>About</h2> <p>This page is under development.</p></div>');
function Ii(e) {
  var t = Ri();
  x(e, t);
}
var $i = O('<div class="form-container"><h2>Privacy</h2> <p>This page is under development.</p></div>');
function Ci(e) {
  var t = $i();
  x(e, t);
}
var Ni = O('<div class="form-container"><h2>UserGuide</h2> <p>This page is under development.</p></div>');
function Pi(e) {
  var t = Ni();
  x(e, t);
}
var Li = O('<div class="form-container"><h2>NotFound</h2> <p>This page is under development.</p></div>');
function Mi(e) {
  var t = Li();
  x(e, t);
}
var Di = O('<div class="app-container svelte-16t12jp"><!> <main id="mainContent" class="svelte-16t12jp"><!></main> <!></div>');
function qi(e) {
  const t = {
    "/": ni,
    "/auth/login": ii,
    "/auth/loginWithCognitoCallback": Cn,
    "/auth/loginWithMockCallback": Cn,
    "/account/bundles": wi,
    "/hmrc/vat/vatObligations": ki,
    "/hmrc/vat/submitVat": Ti,
    "/hmrc/vat/viewVatReturn": Ai,
    "/hmrc/receipt/receipts": Oi,
    "/about": Ii,
    "/privacy": Ci,
    "/guide": Pi,
    "*": Mi,
  };
  var n = Di(),
    r = A(n);
  Ks(r, {});
  var s = I(r, 2),
    i = A(s);
  js(i, {
    get routes() {
      return t;
    },
  });
  var a = I(s, 2);
  (Ws(a, {}), x(e, n));
}
new qi({ target: document.getElementById("app") });
