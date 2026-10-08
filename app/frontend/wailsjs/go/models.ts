export namespace agent {
	
	export class AskParams {
	    question: string;
	    doc: string;
	    selection: string;
	    attachments: string[];
	    mode: string;
	    priorSummaries: boolean;
	    quickId?: string;
	    quickEdited?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new AskParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.question = source["question"];
	        this.doc = source["doc"];
	        this.selection = source["selection"];
	        this.attachments = source["attachments"];
	        this.mode = source["mode"];
	        this.priorSummaries = source["priorSummaries"];
	        this.quickId = source["quickId"];
	        this.quickEdited = source["quickEdited"];
	    }
	}
	export class Preview {
	    messages: llm.Message[];
	    tokens: number;
	    budget: number;
	    over: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Preview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.messages = this.convertValues(source["messages"], llm.Message);
	        this.tokens = source["tokens"];
	        this.budget = source["budget"];
	        this.over = source["over"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace bible {
	
	export class Count {
	    path: string;
	    count: number;
	
	    static createFrom(source: any = {}) {
	        return new Count(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.count = source["count"];
	    }
	}
	export class Entity {
	    path: string;
	    type: string;
	    name: string;
	    aliases: string[];
	
	    static createFrom(source: any = {}) {
	        return new Entity(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.type = source["type"];
	        this.name = source["name"];
	        this.aliases = source["aliases"];
	    }
	}
	export class Index {
	    entities: Entity[];
	    appearances: Record<string, Array<Count>>;
	    byChapter: Record<string, Array<Count>>;
	
	    static createFrom(source: any = {}) {
	        return new Index(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.entities = this.convertValues(source["entities"], Entity);
	        this.appearances = this.convertValues(source["appearances"], Array<Count>, true);
	        this.byChapter = this.convertValues(source["byChapter"], Array<Count>, true);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Variant {
	    entity: string;
	    known: string;
	    variant: string;
	    count: number;
	    chapter: string;
	    snippet: string;
	
	    static createFrom(source: any = {}) {
	        return new Variant(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.entity = source["entity"];
	        this.known = source["known"];
	        this.variant = source["variant"];
	        this.count = source["count"];
	        this.chapter = source["chapter"];
	        this.snippet = source["snippet"];
	    }
	}

}

export namespace llm {
	
	export class ToolCall {
	    id: string;
	    name: string;
	    arguments: string;
	
	    static createFrom(source: any = {}) {
	        return new ToolCall(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.arguments = source["arguments"];
	    }
	}
	export class Message {
	    role: string;
	    content: string;
	    toolCalls?: ToolCall[];
	    toolCallId?: string;
	
	    static createFrom(source: any = {}) {
	        return new Message(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.role = source["role"];
	        this.content = source["content"];
	        this.toolCalls = this.convertValues(source["toolCalls"], ToolCall);
	        this.toolCallId = source["toolCallId"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace main {
	
	export class Option {
	    id: string;
	    label: string;
	
	    static createFrom(source: any = {}) {
	        return new Option(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	    }
	}
	export class ProfileView {
	    id: string;
	    name: string;
	    baseUrl: string;
	    model: string;
	    contextTokens: number;
	    hasKey: boolean;
	    remote: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ProfileView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.baseUrl = source["baseUrl"];
	        this.model = source["model"];
	        this.contextTokens = source["contextTokens"];
	        this.hasKey = source["hasKey"];
	        this.remote = source["remote"];
	    }
	}
	export class RecentView {
	    path: string;
	    name: string;
	    openedAt: string;
	    cover: string;
	    missing: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RecentView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.openedAt = source["openedAt"];
	        this.cover = source["cover"];
	        this.missing = source["missing"];
	    }
	}
	export class SettingsView {
	    profiles: ProfileView[];
	    active: string;
	    platforms: publish.Platform[];
	    theme: string;
	
	    static createFrom(source: any = {}) {
	        return new SettingsView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.profiles = this.convertValues(source["profiles"], ProfileView);
	        this.active = source["active"];
	        this.platforms = this.convertValues(source["platforms"], publish.Platform);
	        this.theme = source["theme"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace notion {
	
	export class File {
	    src: string;
	    name: string;
	    bytes: number;
	
	    static createFrom(source: any = {}) {
	        return new File(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.src = source["src"];
	        this.name = source["name"];
	        this.bytes = source["bytes"];
	    }
	}
	export class Group {
	    key: string;
	    label: string;
	    files: File[];
	
	    static createFrom(source: any = {}) {
	        return new Group(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.label = source["label"];
	        this.files = this.convertValues(source["files"], File);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Plan {
	    source: string;
	    groups: Group[];
	    images: number;
	
	    static createFrom(source: any = {}) {
	        return new Plan(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.source = source["source"];
	        this.groups = this.convertValues(source["groups"], Group);
	        this.images = source["images"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Result {
	    id: string;
	    created: string[];
	    skipped: string[];
	
	    static createFrom(source: any = {}) {
	        return new Result(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.created = source["created"];
	        this.skipped = source["skipped"];
	    }
	}

}

export namespace project {
	
	export class Scene {
	    title: string;
	    line: number;
	
	    static createFrom(source: any = {}) {
	        return new Scene(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.line = source["line"];
	    }
	}
	export class Entry {
	    path: string;
	    kind: string;
	    title: string;
	    status?: string;
	    scenes?: Scene[];
	
	    static createFrom(source: any = {}) {
	        return new Entry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.kind = source["kind"];
	        this.title = source["title"];
	        this.status = source["status"];
	        this.scenes = this.convertValues(source["scenes"], Scene);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class VolumeView {
	    title: string;
	    chapters: Entry[];
	
	    static createFrom(source: any = {}) {
	        return new VolumeView(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.chapters = this.convertValues(source["chapters"], Entry);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Tree {
	    name: string;
	    volumes: VolumeView[];
	    manuscript: Entry[];
	    canon: Entry[];
	    outline: Entry[];
	    notes: Entry[];
	    warnings: string[];
	
	    static createFrom(source: any = {}) {
	        return new Tree(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.volumes = this.convertValues(source["volumes"], VolumeView);
	        this.manuscript = this.convertValues(source["manuscript"], Entry);
	        this.canon = this.convertValues(source["canon"], Entry);
	        this.outline = this.convertValues(source["outline"], Entry);
	        this.notes = this.convertValues(source["notes"], Entry);
	        this.warnings = source["warnings"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Volume {
	    title: string;
	    chapters: string[];
	
	    static createFrom(source: any = {}) {
	        return new Volume(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.chapters = source["chapters"];
	    }
	}

}

export namespace proposal {
	
	export class Proposal {
	    id: string;
	    createdAt: string;
	    model: string;
	    target: string;
	    original: string;
	    replacement: string;
	    rationale: string;
	    assumptions: string[];
	    baseHash: string;
	    start: number;
	    end: number;
	    status: string;
	    snapshotId?: string;
	    relocated?: boolean;
	    authorEdited?: boolean;
	    final?: string;
	
	    static createFrom(source: any = {}) {
	        return new Proposal(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.createdAt = source["createdAt"];
	        this.model = source["model"];
	        this.target = source["target"];
	        this.original = source["original"];
	        this.replacement = source["replacement"];
	        this.rationale = source["rationale"];
	        this.assumptions = source["assumptions"];
	        this.baseHash = source["baseHash"];
	        this.start = source["start"];
	        this.end = source["end"];
	        this.status = source["status"];
	        this.snapshotId = source["snapshotId"];
	        this.relocated = source["relocated"];
	        this.authorEdited = source["authorEdited"];
	        this.final = source["final"];
	    }
	}

}

export namespace publish {
	
	export class Rules {
	    indent: boolean;
	    blankLine: boolean;
	    heading: string;
	    sceneBreak: string;
	    convert: string;
	
	    static createFrom(source: any = {}) {
	        return new Rules(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.indent = source["indent"];
	        this.blankLine = source["blankLine"];
	        this.heading = source["heading"];
	        this.sceneBreak = source["sceneBreak"];
	        this.convert = source["convert"];
	    }
	}
	export class Platform {
	    id: string;
	    name: string;
	    rules: Rules;
	    verified: boolean;
	
	    static createFrom(source: any = {}) {
	        return new Platform(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.rules = this.convertValues(source["rules"], Rules);
	        this.verified = source["verified"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace settings {
	
	export class Profile {
	    id: string;
	    name: string;
	    baseUrl: string;
	    model: string;
	    contextTokens: number;
	
	    static createFrom(source: any = {}) {
	        return new Profile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.baseUrl = source["baseUrl"];
	        this.model = source["model"];
	        this.contextTokens = source["contextTokens"];
	    }
	}

}

export namespace snapshot {
	
	export class Seg {
	    changed: boolean;
	    text: string;
	
	    static createFrom(source: any = {}) {
	        return new Seg(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.changed = source["changed"];
	        this.text = source["text"];
	    }
	}
	export class DiffLine {
	    op: string;
	    text: string;
	    segs?: Seg[];
	
	    static createFrom(source: any = {}) {
	        return new DiffLine(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.op = source["op"];
	        this.text = source["text"];
	        this.segs = this.convertValues(source["segs"], Seg);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Meta {
	    id: string;
	    time: string;
	    label: string;
	    reason: string;
	    files: string[];
	    missing?: string[];
	
	    static createFrom(source: any = {}) {
	        return new Meta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.time = source["time"];
	        this.label = source["label"];
	        this.reason = source["reason"];
	        this.files = source["files"];
	        this.missing = source["missing"];
	    }
	}

}

export namespace summary {
	
	export class Summary {
	    chapter: string;
	    path: string;
	    text: string;
	    exists: boolean;
	    stale: boolean;
	    updated?: string;
	
	    static createFrom(source: any = {}) {
	        return new Summary(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.chapter = source["chapter"];
	        this.path = source["path"];
	        this.text = source["text"];
	        this.exists = source["exists"];
	        this.stale = source["stale"];
	        this.updated = source["updated"];
	    }
	}

}

