// The package is "type": "module", so the Forge bundler treats our files as strict ESM and hands us
// CommonJS modules (@forge/api, @forge/resolver, @forge/kvs) wrapped in an extra `default`.
// Everything Forge-specific is imported through here so the interop lives in one place.
import * as apiModule from '@forge/api';
import * as resolverModule from '@forge/resolver';
import * as kvsModule from '@forge/kvs';

const unwrap = (ns) => (ns.default && ns.default.default ? ns.default.default : ns.default) || ns;
const named = (ns, name) => ns[name] ?? ns.default?.[name];

export const api = unwrap(apiModule);
export const route = named(apiModule, 'route');
export const Resolver = unwrap(resolverModule);
export const kvs = named(kvsModule, 'kvs');
