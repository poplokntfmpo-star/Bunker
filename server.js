const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const rooms = new Map();
const professions = ["Врач", "Инженер", "Учитель", "Повар", "Военный", "Программист", "Психолог", "Фермер", "Ветеринар", "Электрик", "Строитель", "Учёный"];
const health = ["Полностью здоров", "Астма", "Слабое зрение", "Аллергия на пыльцу", "Диабет", "Сломана рука", "Отличное здоровье", "Бессонница"];
const biology = ["25 лет", "31 год", "42 года", "19 лет", "55 лет", "Есть иммунитет к одной болезни", "Группа крови O(I)", "Группа крови AB(IV)"];
const hobbies = ["Рыбалка", "Готовка", "Ремонт техники", "Первая помощь", "Садоводство", "Ориентирование", "Рисование", "Выживание"];
const baggage = ["Аптечка", "Набор инструментов", "Семена овощей", "Фильтр для воды", "Рация без батареи", "Палатка", "Книга по медицине", "Запас консервов"];
const facts = ["Скрывает важную информацию о себе", "Когда-то жил в лесу месяц", "Боится замкнутых пространств", "Умеет чинить генераторы", "Знает 3 языка", "Никогда не пользовался оружием", "Бывший волонтёр", "Умеет быстро считать"];
const disasters = [
  "Глобальная пандемия. Большая часть населения заражена неизвестным вирусом.",
  "Падение астероида. Поверхность планеты сильно разрушена.",
  "Ядерная зима. Температура резко упала, урожаи погибли.",
  "Восстание автономных машин. Электронные системы вышли из-под контроля.",
  "Супервулкан. Атмосфера заполнена пеплом, солнечный свет почти не проходит."
];
const bunkers = [
  "Вместимость: 6 человек. Запас еды на 1 год. Есть генератор и скважина.",
  "Вместимость: 5 человек. Запас еды на 2 года. Нет электричества.",
  "Вместимость: 7 человек. Есть лаборатория, но ограниченный запас воды.",
  "Вместимость: 4 человека. Есть ферма и система очистки воды."
];
const pick = a => a[Math.floor(Math.random()*a.length)];
const code = () => crypto.randomBytes(3).toString("hex").toUpperCase();
function publicRoom(r) {
  return { code:r.code, host:r.host, started:r.started, round:r.round, phase:r.phase,
    disaster:r.disaster, bunker:r.bunker, players:[...r.players.values()].map(p=>({
      id:p.id,name:p.name,alive:p.alive,ready:p.ready,cards:p.cards,
      revealed:p.revealed, votes:p.votes
    })) };
}
function sendRoom(r) { io.to(r.code).emit("room", publicRoom(r)); }
function makeCards() {
  return {profession:pick(professions),health:pick(health),biology:pick(biology),
    hobby:pick(hobbies),baggage:pick(baggage),fact:pick(facts)};
}
io.on("connection", socket => {
  socket.on("createRoom", ({name}) => {
    const roomCode=code(), player={id:socket.id,name:String(name||"Игрок").slice(0,18),
      alive:true,ready:false,cards:makeCards(),revealed:[],votes:null};
    const r={code:roomCode,host:socket.id,players:new Map([[socket.id,player]]),
      started:false,round:0,phase:"lobby",disaster:pick(disasters),bunker:pick(bunkers)};
    rooms.set(roomCode,r); socket.join(roomCode); socket.emit("joined",roomCode); sendRoom(r);
  });
  socket.on("joinRoom", ({code:raw,name}) => {
    const c=String(raw||"").toUpperCase().trim(), r=rooms.get(c);
    if(!r) return socket.emit("errorMsg","Комната не найдена.");
    if(r.started) return socket.emit("errorMsg","Игра уже началась.");
    if(r.players.size>=12) return socket.emit("errorMsg","В комнате максимум 12 игроков.");
    const p={id:socket.id,name:String(name||"Игрок").slice(0,18),alive:true,ready:false,cards:makeCards(),revealed:[],votes:null};
    r.players.set(socket.id,p); socket.join(c); socket.emit("joined",c); sendRoom(r);
  });
  socket.on("startGame", () => {
    const r=[...rooms.values()].find(x=>x.players.has(socket.id));
    if(!r || r.host!==socket.id || r.started) return;
    if(r.players.size<3) return socket.emit("errorMsg","Нужно минимум 3 игрока.");
    r.started=true;r.phase="reveal";r.round=1;sendRoom(r);
  });
  socket.on("revealCard", key => {
    const r=[...rooms.values()].find(x=>x.players.has(socket.id)); if(!r||!r.started||r.phase!=="reveal")return;
    const p=r.players.get(socket.id);
    if(["profession","health","biology","hobby","baggage","fact"].includes(key) && !p.revealed.includes(key)) p.revealed.push(key);
    sendRoom(r);
  });
  socket.on("nextPhase", () => {
    const r=[...rooms.values()].find(x=>x.players.has(socket.id));if(!r||r.host!==socket.id)return;
    if(r.phase==="reveal")r.phase="vote";
    else if(r.phase==="vote"){
      const alive=[...r.players.values()].filter(p=>p.alive);
      const tally={};alive.forEach(p=>{if(p.votes)tally[p.votes]=(tally[p.votes]||0)+1;});
      const target=Object.entries(tally).sort((a,b)=>b[1]-a[1])[0]?.[0];
      if(target && tally[target]>0){const victim=r.players.get(target);if(victim)victim.alive=false;}
      r.players.forEach(p=>p.votes=null);
      r.round++;
      if([...r.players.values()].filter(p=>p.alive).length<=2)r.phase="finished";
      else r.phase="reveal";
    } else if(r.phase==="finished") return;
    sendRoom(r);
  });
  socket.on("vote", target => {
    const r=[...rooms.values()].find(x=>x.players.has(socket.id));if(!r||r.phase!=="vote")return;
    const p=r.players.get(socket.id), t=r.players.get(target);
    if(!p.alive||!t||!t.alive||target===socket.id)return;
    p.votes=target;sendRoom(r);
  });
  socket.on("disconnect",()=>{
    for(const [c,r] of rooms){
      if(r.players.has(socket.id)){
        r.players.delete(socket.id);
        if(r.host===socket.id)r.host=r.players.keys().next().value||null;
        if(!r.players.size)rooms.delete(c);else sendRoom(r);
      }
    }
  });
});
const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`Бункер запущен: http://localhost:${PORT}`));