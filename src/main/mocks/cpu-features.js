// Mock for cpu-features — replaces the native addon with an empty feature set.
// ssh2 uses this for crypto acceleration hints; without it falls back to pure JS.
module.exports = function() { return { features: {} } }
