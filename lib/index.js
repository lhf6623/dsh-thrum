import e from "@deepseek-ai/schemastery";
//#region package.json
var t = "dsh-thrum";
//#endregion
//#region src/shared/identity.ts
function n() {
	return t;
}
var r = "thrum", i = [
	"off",
	"light",
	"medium",
	"strong"
], a = [
	"off",
	"low",
	"medium",
	"high"
], o = [
	"off",
	"ember",
	"blue",
	"spark"
], s = [
	"off",
	"ding",
	"chime",
	"pop"
], c = [
	{
		key: "enabled",
		kind: "boolean",
		def: !0
	},
	{
		key: "opacity",
		kind: "number",
		min: .1,
		max: 1,
		def: .5
	},
	{
		key: "moleFrequency",
		kind: "enum",
		values: a,
		def: "medium"
	},
	{
		key: "feedback",
		kind: "boolean",
		def: !0
	},
	{
		key: "flame",
		kind: "enum",
		values: o,
		def: "ember"
	},
	{
		key: "shake",
		kind: "enum",
		values: i,
		def: "off"
	},
	{
		key: "response",
		kind: "boolean",
		def: !0
	},
	{
		key: "pageShakeLevel",
		kind: "enum",
		values: i,
		def: "off"
	},
	{
		key: "sound",
		kind: "enum",
		values: s,
		def: "ding"
	},
	{
		key: "aiFeedback",
		kind: "boolean",
		def: !0
	}
];
c.map((e) => e.key), Object.fromEntries(c.map((e) => [e.key, e.def]));
//#endregion
//#region src/host/index.ts
var l = n(), u = r;
function d(t) {
	switch (t.kind) {
		case "boolean": return e.boolean().default(t.def).volatile();
		case "number": return e.number().min(t.min).max(t.max).default(t.def).volatile();
		case "enum": return e.union([...t.values]).default(t.def).volatile();
	}
}
var f = e.object(Object.fromEntries(c.map((e) => [e.key, d(e)]))), p = [
	"turn/start",
	"turn/end",
	"step/start",
	"step/end",
	"assistant/message",
	"tool/call",
	"tool/result"
];
function m(e) {
	if (!e || typeof e != "object") return null;
	let t = e;
	return t.type !== "text-delta" && t.type !== "reasoning-delta" ? null : typeof t.text == "string" && t.text.length > 0 ? t.text : null;
}
function h(e) {
	return "data: " + JSON.stringify(e) + "\n\n";
}
var g = {
	inject: ["webServer"],
	apply(e) {
		e.inject(["settings"], (t) => {
			t.effect(() => t.settings.configure({ auto: !1 }, e.fiber));
		});
		let t = /* @__PURE__ */ new Set();
		function n(e) {
			let n = h(e);
			for (let e of t) try {
				e.write(n);
			} catch {}
		}
		e.on("session/event", (e, t) => {
			!t || typeof t.type != "string" || (t.type === "turn/end" && n({ type: "answer-done" }), p.includes(t.type) && n(t.data === void 0 ? { type: t.type } : {
				type: t.type,
				data: t.data
			}));
		}), e.on("agent/assistant-stream", (e) => {
			let t = e?.frame;
			if (!t || t.type !== "chunk") return;
			let r = m(t.chunk);
			r !== null && n({
				type: "assistant/chunk",
				data: { text: r }
			});
		}), e.effect(() => {
			let n = e.webServer.register({
				kind: "exact",
				path: "/api/thrum-events",
				handler: (e, n) => {
					if (e.method !== "GET" && e.method !== "HEAD") {
						n.writeHead(405), n.end();
						return;
					}
					n.writeHead(200, {
						"content-type": "text/event-stream",
						"cache-control": "no-cache",
						connection: "keep-alive"
					}), n.write(": connected\n\n"), t.add(n), n.on("close", () => {
						t.delete(n);
					});
				}
			});
			return () => {
				n();
				for (let e of t) e.destroy();
				t.clear();
			};
		});
	}
};
//#endregion
export { f as Config, o as FLAME_STYLES, a as MOLE_FREQUENCIES, i as SHAKE_LEVELS, s as SOUND_STYLES, u as THRUM_SETTINGS_NAMESPACE, g as default, l as name };
