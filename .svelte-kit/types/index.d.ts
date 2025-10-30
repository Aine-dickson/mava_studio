type DynamicRoutes = {
	
};

type Layouts = {
	"/": undefined;
	"/triggers-demo": undefined
};

export type RouteId = "/" | "/triggers-demo";

export type RouteParams<T extends RouteId> = T extends keyof DynamicRoutes ? DynamicRoutes[T] : Record<string, never>;

export type LayoutParams<T extends RouteId> = Layouts[T] | Record<string, never>;

export type Pathname = "/" | "/triggers-demo";

export type ResolvedPathname = `${"" | `/${string}`}${Pathname}`;

export type Asset = "/bottom.svg" | "/distributedh.svg" | "/distributedv.svg" | "/favicon.png" | "/group.svg" | "/hcenter.svg" | "/left.svg" | "/right.svg" | "/svelte.svg" | "/tauri.svg" | "/top.svg" | "/ungroup.svg" | "/vcenter.svg" | "/vite.svg";