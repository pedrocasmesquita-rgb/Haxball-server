const room = HBInit({
  roomName: "{👑}Portugal Cup (s1)",
  maxPlayers: 20,
  public: true,
  noPlayer: true
});

console.log("Servidor online!");

room.setDefaultStadium("Big");
room.setScoreLimit(5);
room.setTimeLimit(5);
room.setTeamsLock(true);

// =====================
// 🔐 CONFIG
// =====================
const ADMIN_PASSWORD = "pgboss";
const OWNER_NAME = "PGibbon";
const OWNER_PASSWORD = "pgboss_owner";

// =====================
// 📦 STATE
// =====================
let admins = [];
let ownerId = null;
let elo = {};
let assignedTeams = {};

let teamsSorted = false;
let teamsSortedCount = 0;
let autoStarted = false;

// anti spam restore
let restoring = {};
let eloUpdated = false;

// =====================
// 📢 SYSTEM
// =====================
function broadcast(msg, player) {
  let prefix = "";

  if (player?.id === ownerId) prefix = "👑 OWNER ";

  room.sendAnnouncement(
    "⚽ " + prefix + msg,
    null,
    0x00ffcc,
    "bold",
    2
  );
}

function getEloName(player) {
  return `[ELO ${elo[player.id] ?? 0}] ${player.name}`;
}

function isAdmin(player) {
  return admins.includes(player.id);
}

// =====================
// 👥 PLAYERS
// =====================
function findPlayerByName(name) {
  return room.getPlayerList().find(p =>
    p.name.toLowerCase().includes(name.toLowerCase())
  );
}

// =====================
// 🏆 ELO SYSTEM
// =====================
function getWinner() {
  const s = room.getScores();
  if (!s) return null;

  if (s.red > s.blue) return "red";
  if (s.blue > s.red) return "blue";
  return "draw";
}

function changeElo(player, change) {
  elo[player.id] = Math.max(0, (elo[player.id] || 0) + change);
  return elo[player.id];
}

function applyEloUpdate() {
  const result = getWinner();
  if (!result) return;

  const players = room.getPlayerList().filter(p => p.team === 1 || p.team === 2);

  if (result === "draw") {
    room.sendAnnouncement("⚖️ Empate! Nenhum ELO alterado.", null, 0xaaaaaa, "small", 0);
    return;
  }

  players.forEach(p => {
    const won =
      (result === "red" && p.team === 1) ||
      (result === "blue" && p.team === 2);

    const change = won ? 15 : -15;
    const newElo = changeElo(p, change);

    room.sendAnnouncement(
      `🏆 ${p.name} ELO: ${newElo} (${change >= 0 ? "+" : ""}${change})`,
      p.id,
      0xffffff,
      "small",
      1
    );
  });

  room.sendAnnouncement("🔄 ELO atualizado!", null, 0x00ffcc, "small", 0);
}

// =====================
// 👥 TEAMS
// =====================
function assignBalancedTeams() {
  const players = room.getPlayerList().slice();

  players.sort((a, b) => (elo[b.id] || 0) - (elo[a.id] || 0));

  let red = [];
  let blue = [];

  players.forEach((p, i) => {
    const team = i % 2 === 0 ? 1 : 2;

    room.setPlayerTeam(p.id, team);

    if (team === 1) red.push(p);
    else blue.push(p);
  });

  assignedTeams = {};
  red.forEach(p => assignedTeams[p.id] = 1);
  blue.forEach(p => assignedTeams[p.id] = 2);

  teamsSorted = true;
  teamsSortedCount = players.length;
}

// =====================
// 🚀 AUTO START
// =====================
function tryAutoSortAndStart() {
  const players = room.getPlayerList();
  const count = players.length;

  if (count < 2) {
    autoStarted = false;
    assignedTeams = {};
    teamsSorted = false;
    return;
  }

  if (!teamsSorted || teamsSortedCount !== count) {
    assignBalancedTeams();

    const size = Math.ceil(count / 2);
    broadcast(`🎲 ${size}v${size} criado`);
  }

  if (!autoStarted && !room.getScores() && count >= 2) {
    room.startGame();
    autoStarted = true;
  }
}

// =====================
// 🛡️ TEAM LOCK
// =====================
function restoreAssignedTeam(playerId) {
  if (restoring[playerId]) return;

  const assigned = assignedTeams[playerId];
  if (!assigned) return;

  restoring[playerId] = true;

  setTimeout(() => {
    const p = room.getPlayer(playerId);

    if (p && p.team !== assigned) {
      room.setPlayerTeam(playerId, assigned);
    }

    restoring[playerId] = false;
  }, 200);
}

// =====================
// 🟢 JOIN
// =====================
room.onPlayerJoin = (player) => {
  if (player.name === OWNER_NAME) {
    ownerId = player.id;
    if (!admins.includes(player.id)) admins.push(player.id);
    broadcast("👑 OWNER " + player.name + " entrou!");
  } else {
    broadcast("👋 Bem-vindo " + getEloName(player));
  }

  if (!elo[player.id]) elo[player.id] = 0;

  tryAutoSortAndStart();
};

// =====================
// 🔴 LEAVE
// =====================
room.onPlayerLeave = (player) => {
  admins = admins.filter(id => id !== player.id);

  if (player.id === ownerId) ownerId = null;

  broadcast("👋 " + getEloName(player) + " saiu");

  autoStarted = false;
  tryAutoSortAndStart();
};

// =====================
// 🚫 TEAM CHANGE
// =====================
room.onPlayerTeamChange = (player) => {
  restoreAssignedTeam(player.id);
};

// =====================
// 💬 CHAT
// =====================
room.onPlayerChat = (player, message) => {

  let prefix = "";

  if (player.id === ownerId) prefix = "[👑OWNER]";
  else if (isAdmin(player)) prefix = "[🛠ADMIN]";

  // 🔐 LOGIN
  if (message.startsWith("!admin ")) {
    const pass = message.split("!admin ")[1];

    if (pass === ADMIN_PASSWORD) {
      if (!admins.includes(player.id)) admins.push(player.id);
      broadcast("🔐 " + player.name + " agora é admin!");
    }

    if (pass === OWNER_PASSWORD && player.name === OWNER_NAME) {
      ownerId = player.id;
      if (!admins.includes(player.id)) admins.push(player.id);
      broadcast("👑 " + player.name + " agora é OWNER!");
    }

    return true;
  }

  // ❌ KICK
  if (message.startsWith("!kick ")) {
    if (!isAdmin(player)) return false;

    const name = message.split(" ").slice(1).join(" ");
    const target = findPlayerByName(name);

    if (target) {
      room.kickPlayer(target.id, "Kickado por admin", false);
      broadcast("👢 " + target.name + " foi kickado");
    }

    return false;
  }

  // 🚫 BAN
  if (message.startsWith("!ban ")) {
    if (!isAdmin(player)) return false;

    const name = message.split(" ").slice(1).join(" ");
    const target = findPlayerByName(name);

    if (target) {
      room.kickPlayer(target.id, "Banido por admin", true);
      broadcast("🚫 " + target.name + " foi banido");
    }

    return false;
  }

  // 🔄 RESET
  if (message === "!reset") {
    if (!isAdmin(player)) return false;
    room.stopGame();
    broadcast("🔄 Jogo reiniciado!");
    return false;
  }

  // ⚽ START
  if (message === "!start") {
    if (!isAdmin(player)) return false;
    room.startGame();
    broadcast("▶️ Jogo iniciado!");
    return false;
  }

  // 📊 INFO
  if (message === "!info") {
    const owner = room.getPlayerList().find(p => p.id === ownerId);
    broadcast("⚽ Portugal Cup | Admins: " + admins.length +
      (owner ? " | Owner: " + owner.name : ""));
    return false;
  }

  // 💬 CHAT NORMAL
  room.sendAnnouncement(
    prefix + getEloName(player) + ": " + message,
    null,
    0xffffff,
    "normal",
    1
  );

  return false;
};

// =====================
// 🎮 GAME EVENTS
// =====================
room.onGameStart = () => {
  if (autoStarted) {
    autoStarted = false;
    return;
  }

  const players = room.getPlayerList();

  if (players.length >= 2) {
    assignBalancedTeams();
    broadcast("🎲 Equipas sorteadas automaticamente!");
  }
};

room.onGameStop = () => {
  autoStarted = false;

  if (eloUpdated) return;
  eloUpdated = true;

  setTimeout(() => {
    applyEloUpdate();
    eloUpdated = false;
  }, 500);
};

// =====================
// 📢 DISCORD MESSAGE
// =====================
setInterval(() => {
  const players = room.getPlayerList();

  if (players.length > 0) {
    room.sendAnnouncement(
      "👑 Discord: https://discord.gg/kQ9umSkvEr",
      null,
      0x00ffcc,
      "bold",
      2
    );
  }
}, 180000);
