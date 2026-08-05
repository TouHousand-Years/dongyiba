const os = require("node:os");

// tsx uses os.userInfo() only to derive a temporary-directory name. Some
// sandboxed Node 24/Windows environments return UV_ENOMEM from that API even
// though the username and profile environment variables are available.
try {
  os.userInfo();
} catch {
  const username = process.env.USERNAME || "node-user";
  os.userInfo = () => ({
    uid: -1,
    gid: -1,
    username,
    homedir: process.env.USERPROFILE || os.homedir(),
    shell: null,
  });
}
