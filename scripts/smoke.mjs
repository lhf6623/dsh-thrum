#!/usr/bin/env node
/**
 * 冒烟验证（无第三方测试框架）：在假的 cordis 上下文里加载 lib/ 产物，
 * 盯住本插件依赖的 dsh 0.2.0 契约 —— 上游一旦再漂移，这里先炸。
 *
 * 覆盖范围（对应 0.2.0 迁移的断点）：
 *  1. host 不再调用已被删除的 settings.register/installSettingsSection；
 *     改为导出 `.volatile()` 的 Config（设置表单只投影 volatile 字段）+ settings.configure({auto:false})。
 *  2. host 的实时 token 流来源是 agent/assistant-stream（session 事件 assistant/chunk 已不存在），
 *     且不再转发 assistant/chunk 这个不存在的 session 事件。
 *  3. 会话生命周期转发 / answer-done 兼容 / SSE 路由注册保持不变。
 *  4. client 用 ctx.configForms.get("<entryId>") 绑定设置（settingsScope 已删除）。
 *  5. composer 的 DOM 契约：0.2.0 的输入宿主是 Lexical contenteditable
 *     `[data-composer-input]`（不再是 textarea），事件是 beforeinput；
 *     这里用假 DOM 真跑「输入 → 光标 → 粒子/抖动」，并保留 textarea 兼容。
 *
 * 用法：pnpm run build && pnpm run smoke
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const require = createRequire(import.meta.url);
const root = new URL("../", import.meta.url);
const entryId = "thrum"; // 必须与 src/shared/identity.ts 的 SETTINGS_ENTRY_ID 一致

const checks = [];
function check(name, fn) {
  try {
    fn();
    checks.push(`  ✓ ${name}`);
  } catch (error) {
    checks.push(`  ✗ ${name}\n      ${error.message}`);
    process.exitCode = 1;
  }
}
async function checkAsync(name, fn) {
  try {
    await fn();
    checks.push(`  ✓ ${name}`);
  } catch (error) {
    checks.push(`  ✗ ${name}\n      ${error.message}`);
    process.exitCode = 1;
  }
}

// ─────────────────────────── host（lib/index.js） ───────────────────────────
const host = await import(new URL("lib/index.js", root).href);

/** 收集 apply() 期间注册的一切，供断言与事件投递。 */
function bootHost() {
  const listeners = new Map();
  const effects = [];
  const settingsEffects = [];
  let route = null;
  let configure = null;
  const writes = [];
  const fiber = { name: "thrum-fiber" };

  const settingsCtx = {
    effect: (cb) => {
      settingsEffects.push(cb);
      return () => {};
    },
    settings: {
      configure: (presentation, owner) => {
        configure = { presentation, owner };
        return () => {};
      },
    },
  };

  const ctx = {
    fiber,
    on: (name, cb) => {
      if (!listeners.has(name)) listeners.set(name, []);
      listeners.get(name).push(cb);
    },
    // cordis 的 ctx.effect 立即执行回调并保留其返回的 disposer（这里只执行，不保留）。
    effect: (cb) => {
      effects.push(cb);
      const dispose = cb();
      return typeof dispose === "function" ? dispose : () => {};
    },
    inject: (names, cb) => {
      assert.ok(
        names.includes("settings"),
        "host 必须在可选 inject 里声明 settings",
      );
      cb(settingsCtx);
    },
    webServer: {
      register: (r) => {
        route = r;
        return () => {};
      },
    },
  };

  const plugin = host.default ?? host;
  plugin.apply(ctx);
  for (const cb of settingsEffects) cb();

  const emit = (name, ...args) => {
    for (const cb of listeners.get(name) ?? []) cb(...args);
  };

  /** 开一条假 SSE 连接，返回它收到的帧。 */
  const openConnection = () => {
    const frames = [];
    const res = {
      destroyed: false,
      writeHead: (status, headers) => Object.assign(res, { status, headers }),
      write: (line) => frames.push(line),
      on: () => {},
      destroy: () => {
        res.destroyed = true;
      },
    };
    route.handler({ method: "GET" }, res);
    // 过滤 SSE 注释帧（首帧 ": connected"）。
    const parsed = () =>
      frames
        .filter((line) => String(line).startsWith("data: "))
        .map((line) => JSON.parse(String(line).slice(6)));
    return { res, frames, parsed };
  };

  return {
    host,
    plugin,
    route,
    configure,
    fiber,
    emit,
    openConnection,
    writes,
  };
}

const booted = bootHost();

await checkAsync("host: apply() 不抛错且导出 name/Config/apply", () => {
  // cordis 允许插件模块把 name/Config 作为具名导出、apply 放在 default 对象里。
  assert.equal(booted.host.name, "dsh-thrum");
  assert.ok(booted.host.Config, "必须导出 Config schema");
  assert.equal(typeof booted.plugin.apply, "function");
  assert.ok(Array.isArray(booted.plugin.inject));
});

check("host: settings.configure({auto:false}, 本插件 fiber) 已注册", () => {
  assert.ok(
    booted.configure,
    "未调用 settings.configure —— 0.2.0 会自动生成一张空表单",
  );
  assert.deepEqual(booted.configure.presentation, { auto: false });
  assert.equal(booted.configure.owner, booted.fiber);
});

check("host: Config 字段全部 volatile（设置表单只投影 volatile 字段）", () => {
  const dict = booted.host.Config.dict;
  for (const key of [
    "enabled",
    "opacity",
    "moleFrequency",
    "flame",
    "shake",
    "pageShakeLevel",
    "sound",
    "aiFeedback",
  ]) {
    assert.ok(dict[key], `Config 缺少字段 ${key}`);
    assert.equal(
      dict[key].meta?.volatile,
      true,
      `Config.${key} 未标 .volatile()`,
    );
  }
});

check("host: volatile 字段解析为 Observable，默认值仍生效", () => {
  const parsed = booted.host.Config({ flame: "blue" });
  assert.equal(
    typeof parsed.flame?.get,
    "function",
    "volatile 字段应是 Observable",
  );
  assert.equal(parsed.flame.get(), "blue");
  assert.equal(parsed.opacity.get(), 0.5, "未提供的字段应回落 schema 默认值");
});

check("host: SSE 路由 /api/thrum-events 已注册且拒绝非 GET/HEAD", () => {
  assert.ok(booted.route, "webServer.register 未被调用");
  assert.equal(booted.route.kind, "exact");
  assert.equal(booted.route.path, "/api/thrum-events");
  const blocked = { writeHead: (s) => {}, end: () => {} };
  booted.route.handler({ method: "POST" }, blocked);
});

check("host: session/event 生命周期转发 + turn/end 兼容 answer-done", () => {
  const conn = booted.openConnection();
  booted.emit("session/event", {}, { type: "turn/start" });
  booted.emit("session/event", {}, { type: "turn/end" });
  booted.emit(
    "session/event",
    {},
    { type: "tool/call", data: { name: "bash" } },
  );
  booted.emit("session/event", {}, { type: "noise/ignored" });
  const frames = conn.parsed();
  assert.deepEqual(
    frames.map((f) => f.type),
    ["turn/start", "answer-done", "turn/end", "tool/call"],
  );
  assert.deepEqual(frames[3].data, { name: "bash" });
  conn.res.destroy();
});

check("host: 不再转发已删除的 session 事件 assistant/chunk", () => {
  const conn = booted.openConnection();
  booted.emit(
    "session/event",
    {},
    { type: "assistant/chunk", data: { chunk: "x" } },
  );
  assert.equal(
    conn.parsed().length,
    0,
    "assistant/chunk 已不是 session 事件，不应出现在转发表里",
  );
  conn.res.destroy();
});

check(
  "host: agent/assistant-stream 的文本增量包装成 assistant/chunk 下发",
  () => {
    const conn = booted.openConnection();
    booted.emit("agent/assistant-stream", {
      frame: { type: "start", attemptId: "a", revision: 1, turn: 1, step: 1 },
    });
    booted.emit("agent/assistant-stream", {
      frame: {
        type: "chunk",
        attemptId: "a",
        revision: 1,
        index: 0,
        chunk: { type: "text-delta", index: 0, text: "你好" },
      },
    });
    booted.emit("agent/assistant-stream", {
      frame: {
        type: "chunk",
        attemptId: "a",
        revision: 1,
        index: 1,
        chunk: { type: "reasoning-delta", index: 1, text: "think" },
      },
    });
    booted.emit("agent/assistant-stream", {
      frame: {
        type: "chunk",
        attemptId: "a",
        revision: 1,
        index: 2,
        chunk: { type: "usage", usage: {} },
      },
    });
    booted.emit("agent/assistant-stream", {
      frame: {
        type: "end",
        attemptId: "a",
        revision: 1,
        index: 3,
        outcome: {},
      },
    });
    const frames = conn.parsed();
    assert.deepEqual(frames, [
      { type: "assistant/chunk", data: { text: "你好" } },
      { type: "assistant/chunk", data: { text: "think" } },
    ]);
    conn.res.destroy();
  },
);

// ─────────────────────────── client（lib/client.js） ───────────────────────────
// 极简 DOM 假件：只实现插件实际用到的 API（事件树 / closest / 选区 / canvas 2d / rAF），
// 好在 Node 里真实跑一遍「composer 输入 → 光标定位 → 粒子 → 绘制」这条链路。
function createDom() {
  const noop = () => {};
  const canvasCalls = { clearRect: 0, arc: [], fill: 0 };
  const ctx2d = {
    fillStyle: "",
    globalCompositeOperation: "",
    clearRect: () => {
      canvasCalls.clearRect += 1;
    },
    beginPath: noop,
    arc: (x, y, r) => {
      canvasCalls.arc.push({ x, y, r });
    },
    fill: () => {
      canvasCalls.fill += 1;
    },
  };
  const state = { range: null };
  const rafQueue = [];

  function matches(el, selector) {
    const m = /^\[([a-zA-Z-]+)\]$/.exec(selector);
    return m ? el.hasAttribute(m[1]) : false;
  }

  class FakeElement {
    constructor(tag, attrs = {}) {
      this.tagName = String(tag).toUpperCase();
      this.attrs = { ...attrs };
      this.children = [];
      this.parentNode = null;
      this.isConnected = false;
      this.dataset = {};
      this.textContent = "";
      this.className = "";
      this.scrollLeft = 0;
      this.scrollTop = 0;
      this.scrollHeight = 0;
      this.offsetLeft = 0;
      this.offsetTop = 0;
      this.rect = { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
      this.animateCalls = [];
      this.style = { setProperty: noop };
      this.listeners = new Map();
      if (this.tagName === "CANVAS") {
        this.width = 0;
        this.height = 0;
        this.getContext = () => ctx2d;
      }
    }
    setAttribute(name, value) {
      this.attrs[name] = value;
    }
    getAttribute(name) {
      return name in this.attrs ? this.attrs[name] : null;
    }
    hasAttribute(name) {
      return name in this.attrs;
    }
    toggleAttribute(name, force) {
      if (force) this.attrs[name] = "";
      else delete this.attrs[name];
    }
    matches(selector) {
      return matches(this, selector);
    }
    closest(selector) {
      let node = this;
      while (node) {
        if (matches(node, selector)) return node;
        node = node.parentNode;
      }
      return null;
    }
    contains(node) {
      let cur = node;
      while (cur) {
        if (cur === this) return true;
        cur = cur.parentNode;
      }
      return false;
    }
    appendChild(child) {
      child.parentNode = this;
      child.isConnected = this.isConnected;
      this.children.push(child);
      return child;
    }
    removeChild(child) {
      this.children = this.children.filter((c) => c !== child);
      child.parentNode = null;
      child.isConnected = false;
    }
    remove() {
      if (this.parentNode) this.parentNode.removeChild(this);
    }
    addEventListener(type, fn) {
      if (!this.listeners.has(type)) this.listeners.set(type, new Set());
      this.listeners.get(type).add(fn);
    }
    removeEventListener(type, fn) {
      this.listeners.get(type)?.delete(fn);
    }
    dispatchEvent(event) {
      event.target = event.target ?? this;
      for (const fn of [...(this.listeners.get(event.type) ?? [])]) fn(event);
      return !event.defaultPrevented;
    }
    getBoundingClientRect() {
      return this.rect;
    }
    animate(keyframes, options) {
      this.animateCalls.push({ keyframes, options });
      return { cancel: noop, onfinish: null };
    }
  }

  const doc = new FakeElement("#document");
  doc.hidden = false;
  doc.head = new FakeElement("head");
  doc.documentElement = new FakeElement("html");
  doc.documentElement.isConnected = true;
  doc.body = new FakeElement("body");
  doc.body.isConnected = true;
  doc.createElement = (tag) => {
    const el = new FakeElement(tag);
    el.ownerDocument = doc;
    return el;
  };
  doc.querySelector = () => null;
  doc.getSelection = () =>
    state.range
      ? { rangeCount: 1, getRangeAt: () => state.range }
      : { rangeCount: 0, getRangeAt: () => null };
  // Range 假件：只实现「可删内容」判定用到的文本投影语义。
  doc.createRange = () => ({
    host: null,
    start: 0,
    end: 0,
    selectNodeContents(host) {
      this.host = host;
      this.start = 0;
      this.end = (host.textContent ?? "").length;
    },
    setStart(_node, offset) {
      this.start = offset;
    },
    setEnd(_node, offset) {
      this.end = offset;
    },
    toString() {
      return (this.host?.textContent ?? "").slice(this.start, this.end);
    },
  });

  const store = new Map();
  const captured = [];
  const win = {
    __ModuleLoader__: { load: (m) => captured.push(m) },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, v),
    },
    innerWidth: 1280,
    innerHeight: 800,
    addEventListener: noop,
    removeEventListener: noop,
    requestAnimationFrame: (cb) => {
      rafQueue.push(cb);
      return rafQueue.length;
    },
    cancelAnimationFrame: noop,
    setTimeout: (...args) => setTimeout(...args),
    clearTimeout: (...args) => clearTimeout(...args),
    matchMedia: () => ({ matches: false }),
  };

  function flushRaf(times = 1) {
    for (let i = 0; i < times; i++) {
      for (const cb of rafQueue.splice(0)) cb(Date.now());
    }
  }

  /** 把 DOM/浏览器全局装到 globalThis，供产物在 vm 里直接使用。 */
  function install() {
    globalThis.window = win;
    globalThis.document = doc;
    globalThis.matchMedia = win.matchMedia;
    globalThis.requestAnimationFrame = win.requestAnimationFrame;
    globalThis.cancelAnimationFrame = win.cancelAnimationFrame;
    globalThis.getComputedStyle = () => ({ height: "40px" });
    // 不连真实 SSE；Node 的全局 EventSource 会试图解析相对 URL。
    globalThis.EventSource = undefined;
  }

  return {
    doc,
    win,
    captured,
    canvasCalls,
    state,
    flushRaf,
    install,
    FakeElement,
  };
}

const dom = createDom();
dom.install();
const moduleExports = (() => {
  vm.runInThisContext(
    readFileSync(fileURLToPath(new URL("lib/client.js", root)), "utf8"),
    { filename: "lib/client.js" },
  );
  assert.equal(
    dom.captured.length,
    1,
    "客户端产物必须调用一次 window.__ModuleLoader__.load",
  );
  assert.equal(dom.captured[0].id, "dsh-thrum");
  return dom.captured[0].factory(require);
})();

/** 以一份可变的 settings 表单快照启动 client 插件，返回操作句柄。 */
function bootClient() {
  const value = {
    enabled: true,
    opacity: 0.5,
    moleFrequency: "medium",
    flame: "ember",
    shake: "off",
    pageShakeLevel: "off",
    sound: "off",
    aiFeedback: false,
  };
  const listeners = [];
  const writes = [];
  const form = {
    getSnapshot: () => ({
      status: "ready",
      value,
      base: undefined,
      user: undefined,
      revision: 3,
      writable: true,
      mode: "host",
    }),
    subscribe: (fn) => {
      listeners.push(fn);
      return () => {};
    },
    set: (field, fieldValue) => {
      writes.push([field, fieldValue]);
      return Promise.resolve(true);
    },
    unset: () => Promise.resolve(true),
    mutate: () => Promise.resolve(true),
  };

  let requested = null;
  const ctx = {
    locale: {
      register: () => () => {},
      getSnapshot: () => ({ active: "en", locales: [], revision: 1 }),
      subscribe: () => () => {},
      bind: () => (key) => key,
    },
    slots: { inject: () => {}, register: () => () => {} },
    configForms: {
      get: (id) => {
        requested = id;
        return form;
      },
    },
    // cordis 的 ctx.effect 立即执行回调并保留其返回的 disposer。
    effect: (cb) => {
      const dispose = cb();
      return typeof dispose === "function" ? dispose : () => {};
    },
  };

  moduleExports.apply(ctx);

  /** 让配置 store 看到新的系统设置值（表单快照变化 → 订阅者同步）。 */
  const setConfig = (patch) => {
    Object.assign(value, patch);
    for (const fn of listeners) fn();
  };

  return { value, form, writes, requested, setConfig };
}

/** 造一棵 composer DOM：卡片 + 输入宿主（contenteditable 或 textarea）。 */
function composerDom(tag, options = {}) {
  const card = dom.doc.createElement("div");
  card.setAttribute("data-composer-card", "");
  card.isConnected = true;
  const input = dom.doc.createElement(tag);
  if (tag === "div") {
    input.setAttribute("data-composer-input", "");
    input.isContentEditable = true;
  } else {
    input.value = options.value ?? "";
    input.selectionEnd = options.selectionEnd ?? 0;
    input.scrollHeight = 40;
  }
  input.rect = options.rect ?? { left: 10, top: 20, width: 300, height: 40 };
  card.appendChild(input);
  return { card, input };
}

/** 派发一次 composer 编辑事件（beforeinput/input/keydown），target 显式指定。 */
function fireComposerEvent(type, target, extra = {}) {
  dom.doc.dispatchEvent({
    type,
    target,
    defaultPrevented: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    ...extra,
  });
}

const client = bootClient();

check("client: 产物导出 apply/inject（ModuleLoader 契约）", () => {
  assert.equal(typeof moduleExports.apply, "function");
  assert.ok(Array.isArray(moduleExports.inject));
  assert.ok(
    moduleExports.inject.includes("configForms"),
    "必须声明 configForms 依赖",
  );
  assert.ok(
    !moduleExports.inject.includes("settingsScope"),
    "settingsScope 在 0.2.0 已删除",
  );
});

check("client: apply() 用 entry id 绑定 configForms 表单并写回系统设置", () => {
  assert.equal(client.requested, entryId, `应绑定 entry id "${entryId}"`);
  assert.equal(
    dom.win.localStorage.getItem("dsh-thrum.config")?.includes("ember"),
    true,
    "表单 ready 后系统值应回写 localStorage",
  );
});

check(
  "client: 0.2.0 composer（contenteditable + beforeinput）喷出打字火焰",
  () => {
    client.setConfig({ flame: "ember" });
    const { input } = composerDom("div");
    dom.state.range = {
      startContainer: input,
      collapsed: true,
      getClientRects: () => [],
      getBoundingClientRect: () => ({
        left: 321,
        top: 432,
        width: 0,
        height: 18,
      }),
    };
    dom.flushRaf(80); // 排空上一测试残留的粒子
    const before = dom.canvasCalls.arc.length;
    fireComposerEvent("beforeinput", input);
    dom.flushRaf(1);
    const drawn = dom.canvasCalls.arc.slice(before);
    assert.ok(
      drawn.length > 0,
      "beforeinput 未触发火焰 —— composer 事件源与上游 DOM 契约又对不上了",
    );
    assert.ok(
      Math.abs(drawn[0].x - 321) < 5 && Math.abs(drawn[0].y - 432) < 5,
      `火焰应喷在光标 rect 处，实际 (${drawn[0].x}, ${drawn[0].y})`,
    );
  },
);

check("client: 旧版 textarea + input 路径保持可用", () => {
  client.setConfig({ flame: "blue" });
  const { input } = composerDom("textarea", {
    value: "hello",
    selectionEnd: 5,
    rect: { left: 100, top: 200, width: 300, height: 40 },
  });
  dom.state.range = null;
  dom.flushRaf(80);
  const before = dom.canvasCalls.arc.length;
  fireComposerEvent("input", input);
  dom.flushRaf(1);
  const drawn = dom.canvasCalls.arc.slice(before);
  assert.ok(drawn.length > 0, "textarea 的 input 事件未触发火焰");
  assert.ok(
    Math.abs(drawn[0].x - 100) < 5 && Math.abs(drawn[0].y - 200) < 5,
    `textarea 火焰应喷在镜像光标处，实际 (${drawn[0].x}, ${drawn[0].y})`,
  );
});

check("client: 同一次编辑的 keydown+beforeinput+input 只算一次", () => {
  client.setConfig({ flame: "ember" });
  const { input } = composerDom("div");
  dom.state.range = {
    startContainer: input,
    collapsed: true,
    getClientRects: () => [],
    getBoundingClientRect: () => ({ left: 50, top: 60, width: 0, height: 18 }),
  };
  dom.flushRaf(80);
  const before = dom.canvasCalls.arc.length;
  fireComposerEvent("keydown", input, { key: "a" });
  fireComposerEvent("beforeinput", input);
  fireComposerEvent("input", input);
  dom.flushRaf(1);
  assert.equal(
    dom.canvasCalls.arc.length - before,
    16,
    "同一次编辑应只喷一次（ember = 16 粒）",
  );
});

check("client: 编辑事件缺失时 keydown 兜底触发火焰", () => {
  client.setConfig({ flame: "ember" });
  const { input } = composerDom("div");
  dom.state.range = null;
  dom.flushRaf(80);
  const before = dom.canvasCalls.arc.length;
  fireComposerEvent("keydown", input, { key: "x" });
  dom.flushRaf(1);
  assert.ok(
    dom.canvasCalls.arc.length > before,
    "只有 keydown 时兜底没有触发火焰",
  );
});

check("client: 有内容可删时回退/删除喷火", () => {
  client.setConfig({ flame: "ember" });
  const cases = [
    { key: "Backspace", text: "hello", offset: 5, collapsed: true },
    { key: "Delete", text: "hello", offset: 0, collapsed: true },
    { key: "Backspace", text: "hello", offset: 2, collapsed: false }, // 选中一段
  ];
  for (const c of cases) {
    const { input } = composerDom("div");
    input.textContent = c.text;
    dom.state.range = {
      startContainer: input,
      startOffset: c.offset,
      collapsed: c.collapsed,
      getClientRects: () => [],
      getBoundingClientRect: () => ({
        left: 77,
        top: 88,
        width: 0,
        height: 18,
      }),
    };
    dom.flushRaf(80);
    const before = dom.canvasCalls.arc.length;
    fireComposerEvent("keydown", input, { key: c.key });
    dom.flushRaf(1);
    const drawn = dom.canvasCalls.arc.slice(before);
    assert.ok(
      drawn.length > 0,
      `${c.key} @${c.offset}（"${c.text}"）应喷火，实际没有`,
    );
    assert.ok(
      Math.abs(drawn[0].x - 77) < 5 && Math.abs(drawn[0].y - 88) < 5,
      `${c.key} 火焰应喷在光标处，实际 (${drawn[0].x}, ${drawn[0].y})`,
    );
  }
});

check("client: 无可删内容（空输入框 / 已在文本两端）不喷火", () => {
  client.setConfig({ flame: "ember" });
  const cases = [
    { key: "Backspace", text: "", offset: 0 }, // 空输入框按住回退
    { key: "Delete", text: "", offset: 0 },
    { key: "Backspace", text: "hello", offset: 0 }, // 光标已在最前
    { key: "Delete", text: "hello", offset: 5 }, // 光标已在最后
  ];
  for (const c of cases) {
    const { input } = composerDom("div");
    input.textContent = c.text;
    dom.state.range = {
      startContainer: input,
      startOffset: c.offset,
      collapsed: true,
      getClientRects: () => [],
      getBoundingClientRect: () => ({
        left: 10,
        top: 10,
        width: 0,
        height: 18,
      }),
    };
    dom.flushRaf(80);
    const before = dom.canvasCalls.arc.length;
    fireComposerEvent("keydown", input, { key: c.key });
    dom.flushRaf(1);
    assert.equal(
      dom.canvasCalls.arc.length,
      before,
      `${c.key} @${c.offset}（"${c.text}"）没有可删内容，不该喷火`,
    );
  }
});

check("client: 剪切/粘贴/撤销快捷键算一次编辑", () => {
  client.setConfig({ flame: "ember" });
  for (const key of ["x", "v", "z"]) {
    const { input } = composerDom("div");
    dom.state.range = null;
    dom.flushRaf(80);
    const before = dom.canvasCalls.arc.length;
    fireComposerEvent("keydown", input, { key, metaKey: true });
    dom.flushRaf(1);
    assert.ok(
      dom.canvasCalls.arc.length > before,
      `Cmd+${key.toUpperCase()} 没有触发火焰`,
    );
  }
});

check("client: 非编辑键（Shift/方向键/全选）不触发兜底火焰", () => {
  client.setConfig({ flame: "ember" });
  const { input } = composerDom("div");
  dom.state.range = null;
  dom.flushRaf(80);
  const before = dom.canvasCalls.arc.length;
  fireComposerEvent("keydown", input, { key: "Shift" });
  fireComposerEvent("keydown", input, { key: "ArrowLeft" });
  fireComposerEvent("keydown", input, { key: "a", metaKey: true });
  dom.flushRaf(1);
  assert.equal(
    dom.canvasCalls.arc.length,
    before,
    "Shift / 方向键 / Cmd+A 不应触发打字火焰",
  );
});

check("client: 输入抖动同样走 contenteditable composer", () => {
  client.setConfig({ flame: "off", shake: "light" });
  const { card, input } = composerDom("div");
  dom.state.range = null;
  fireComposerEvent("beforeinput", input);
  assert.ok(
    card.animateCalls.length > 0,
    "contenteditable 上的输入没有触发卡片抖动",
  );
});

check("client: 火焰关闭（flame=off）时不喷", () => {
  client.setConfig({ flame: "off", shake: "off" });
  const { input } = composerDom("div");
  dom.state.range = null;
  dom.flushRaf(80); // 排空上一测试残留的粒子
  const before = dom.canvasCalls.arc.length;
  fireComposerEvent("beforeinput", input);
  dom.flushRaf(1);
  assert.equal(dom.canvasCalls.arc.length, before, "flame=off 仍喷了粒子");
});

console.log("dsh-thrum smoke\n" + checks.join("\n"));
if (process.exitCode) {
  console.error("\n冒烟验证失败 —— 上游 dsh API 可能又变了（见上方 ✗）。");
} else {
  console.log("\n全部通过。");
}
