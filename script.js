// ════════════════════════════════════════════
// SUPABASE — remplacer SUPA_KEY par ta clé anon
// Dashboard → Settings → API → anon public
// ════════════════════════════════════════════
const SUPA_URL = 'https://tvnphodfkfmsbvsvmayy.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2bnBob2Rma2Ztc2J2c3ZtYXl5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0NTk2NDcsImV4cCI6MjA5MjAzNTY0N30._wuN54nEKEld7e-KWmBLD-Mfycq9aUprQVISEDJ4RNs';
const db = window.supabase.createClient(SUPA_URL, SUPA_KEY);

// ════════════════════════════════════════════
// CONFIG STATIQUE — auth + navigation
// ════════════════════════════════════════════
const USERS = {
  'william.yelle':     {pass:'boss007$$', name:'William Yelle',        role:'admin',   secondary:null,    av:'WY',rc:'rp',rl:'Admin'},
  'matis.boulay':      {pass:'boss007$$', name:'Matis Boulay',         role:'admin',   secondary:null,    av:'MB',rc:'rp',rl:'Admin'},
  'will.lowe':         {pass:'Wl27kp',    name:'Will Lowe',            role:'lead',    secondary:null,    av:'WL',rc:'rl',rl:'Lead ventes'},
  'edouard.dufault':   {pass:'Ed93rx',    name:'Édouard Dufault',      role:'terrain', secondary:null,    av:'ED',rc:'rt',rl:'Paysagement'},
  'laurier.st-germain':{pass:'Ls58qm',    name:'Laurier St-Germain',   role:'terrain', secondary:null,    av:'LS',rc:'rt',rl:'Paysagement'},
  'justin.barriere':   {pass:'Jb41tz',    name:'Justin Barrière',      role:'terrain', secondary:null,    av:'JB',rc:'rt',rl:'Paysagement'},
  'maxime.beaupre':    {pass:'Mb76vn',    name:'Maxime Beaupré',       role:'terrain', secondary:null,    av:'MB',rc:'rt',rl:'Paysagement'},
  'otavio.haygert':    {pass:'Oh29dk',    name:'Otavio Haygert Roxo',  role:'terrain', secondary:null,    av:'OH',rc:'rt',rl:'Paysagement'},
  'xavier.chagnon':    {pass:'Xc64pl',    name:'Xavier Chagnon',       role:'terrain', secondary:null,    av:'XC',rc:'rt',rl:'Paysagement'},
  'marc.yankov':       {pass:'My82qs',    name:'Marc Yankov',          role:'rep',     secondary:'terrain',av:'MY',rc:'rr',rl:'Rep + Paysagement'},
  'adrian.bonspille':  {pass:'Ab37wf',    name:'Adrian Bonspille',     role:'terrain', secondary:null,    av:'AB',rc:'rt',rl:'Paysagement'},
  'felix.scully':      {pass:'Fs95jm',    name:'Félix-Antoine Scully', role:'terrain', secondary:null,    av:'FS',rc:'rt',rl:'Paysagement'},
  'victor.mathieu':    {pass:'Vm48ra',    name:'Victor Mathieu',       role:'tech',    secondary:null,    av:'VM',rc:'rte',rl:'Tech fenêtres'},
  'manuel.martinez':   {pass:'Mm63xe',    name:'Manuel Martinez',      role:'tech',    secondary:null,    av:'MM',rc:'rte',rl:'Tech fenêtres'},
  'maxime.jeffrey':    {pass:'Mj21cu',    name:'Maxime Jeffrey',       role:'tech',    secondary:null,    av:'MJ',rc:'rte',rl:'Tech fenêtres'},
  'vincent.caya':      {pass:'Vc74nb',    name:'Vincent Caya',         role:'tech',    secondary:null,    av:'VC',rc:'rte',rl:'Tech fenêtres'},
  'charles.yelle':     {pass:'Cy56ht',    name:'Charles Yelle',        role:'tech',    secondary:null,    av:'CY',rc:'rte',rl:'Tech fenêtres'},
  'robin.bousquet':    {pass:'Rb39kp',    name:'Robin Bousquet',       role:'tech',    secondary:null,    av:'RB',rc:'rte',rl:'Tech fenêtres'},
  'nathan.quintal':    {pass:'Nq84zd',    name:'Nathan Quintal',       role:'rep',     secondary:null,    av:'NQ',rc:'rr',rl:'Rep D2D'},
  'maxime.santander':  {pass:'Ms72lf',    name:'Maxime Santander',     role:'rep',     secondary:null,    av:'MS',rc:'rr',rl:'Rep D2D'},
};

const DEMO = [
  {u:'william.yelle',  n:'William Yelle',        r:'Admin',            c:'var(--teal)'},
  {u:'matis.boulay',   n:'Matis Boulay',          r:'Admin',            c:'var(--teal)'},
  {u:'will.lowe',      n:'Will Lowe',             r:'Lead ventes',      c:'var(--td)'},
  {u:'nathan.quintal', n:'Nathan Quintal',        r:'Rep D2D',          c:'var(--ol)'},
  {u:'maxime.santander',n:'Maxime Santander',     r:'Rep D2D',          c:'var(--ol)'},
  {u:'marc.yankov',    n:'Marc Yankov',           r:'Rep + Paysagement',c:'var(--ol)'},
  {u:'edouard.dufault',n:'Édouard Dufault',      r:'Paysagement',      c:'var(--olive)'},
  {u:'victor.mathieu', n:'Victor Mathieu',        r:'Tech fenêtres',    c:'var(--blue)'},
  {u:'charles.yelle',  n:'Charles Yelle',         r:'Tech fenêtres',    c:'var(--blue)'},
  {u:'vincent.caya',   n:'Vincent Caya',          r:'Tech fenêtres',    c:'var(--blue)'},
];

const REP_USERNAME = {
  'nathan':   'nathan.quintal',
  'maxime_s': 'maxime.santander',
  'marc_y':   'marc.yankov',
  'willl':    'will.lowe',
};

const SPLASH_INFO = {
  admin:   {badge:'Admin — Accès complet',    greet:'Bienvenue dans votre espace'},
  lead:    {badge:'Lead des ventes',          greet:'Votre pipeline vous attend'},
  rep:     {badge:'Rep D2D',                  greet:'Bonne journée sur le terrain'},
  terrain: {badge:'Paysagement',              greet:'Prêt à commencer?'},
  tech:    {badge:'Technicien fenêtres',      greet:'Votre calendrier est prêt'},
};

const NAV = {
  admin:[
    {s:'Tableau de bord',i:[{id:'dashboard',l:'Accueil',ic:'🏠'},{id:'clients',l:'Base clients',ic:'🗂'},{id:'pipeline-mw',l:'Pipeline MW',ic:'📊'},{id:'pipeline-reps',l:'Pipeline reps',ic:'👥'}]},
    {s:'Planification',  i:[{id:'cal-vitres',l:'Fenêtres',ic:'🪟'},{id:'cal-gazon',l:'Paysagement',ic:'🌿'}]},
    {s:'Finance — Admin',i:[{id:'comm-admin',l:'Commissions & Payes',ic:'💳'},{id:'soumissions',l:'Soumissions',ic:'📄'}]},
    {s:'Terrain',        i:[{id:'spotio',l:'Carte D2D',ic:'📍'}]},
  ],
  lead:[
    {s:'Principal',    i:[{id:'dashboard',l:'Accueil',ic:'🏠'},{id:'pipeline-mw',l:'Pipeline MW',ic:'📊'},{id:'pipeline-reps',l:'Pipeline reps',ic:'👥'}]},
    {s:'Planification',i:[{id:'cal-vitres',l:'Fenêtres',ic:'🪟'},{id:'cal-gazon',l:'Paysagement',ic:'🌿'}]},
    {s:'Finance',      i:[{id:'comm-perso',l:'Mes commissions',ic:'💰'},{id:'soumissions',l:'Soumissions',ic:'📄'}]},
  ],
  rep:[
    {s:'Mes ventes',i:[{id:'pipeline-perso',l:'Mon pipeline',ic:'📊'},{id:'comm-perso',l:'Mes commissions',ic:'💰'},{id:'soumissions',l:'Mes soumissions',ic:'📄'},{id:'spotio',l:'Carte D2D',ic:'📍'}]},
  ],
  rep_terrain:[
    {s:'Mes ventes',    i:[{id:'pipeline-perso',l:'Mon pipeline D2D',ic:'📊'},{id:'comm-perso',l:'Mes commissions',ic:'💰'},{id:'soumissions',l:'Mes soumissions',ic:'📄'},{id:'spotio',l:'Carte D2D',ic:'📍'}]},
    {s:'Paysagement',   i:[{id:'home-terrain',l:'Clock in / Ma journée',ic:'⏱'},{id:'cal-gazon',l:'Mon calendrier gazon',ic:'🌿'},{id:'paye-perso',l:'Ma paye',ic:'💵'}]},
  ],
  terrain:[
    {s:'Mon espace',i:[{id:'home-terrain',l:'Accueil + Clock in',ic:'⏱'},{id:'cal-gazon',l:'Mon calendrier',ic:'🌿'},{id:'paye-perso',l:'Ma paye',ic:'💵'}]},
  ],
  tech:[
    {s:'Mon espace',i:[{id:'cal-vitres',l:'Mon calendrier',ic:'🪟'},{id:'pipeline-perso',l:'Mes rappels',ic:'📊'},{id:'comm-perso',l:'Mes commissions',ic:'💰'},{id:'soumissions',l:'Soumissions',ic:'📄'}]},
  ],
};

// ════════════════════════════════════════════
// DONNÉES FALLBACK (si Supabase vide / clé manquante)
// ════════════════════════════════════════════
const FB_PIPE_MW = [
  {id:'new',title:'New Leads',color:'#69C9CA',deals:[{n:'Sophie Bergeron',s:'Fenêtres int/ext',p:350,src:'Ads',tel:'514-555-0100',d:'Auj.'},{n:'Jean Martin',s:'Tonte saisonnière',p:600,src:'Flyers',tel:'450-555-0200',d:'Auj.'},{n:'Résidence Côté',s:'Fenêtres ext.',p:220,src:'Google',tel:'514-555-0300',d:'Hier'}]},
  {id:'contact',title:'Attempted Contact',color:'#94a3b8',deals:[{n:'Marc Lévesque',s:'Ouverture terrain',p:275,src:'D2D',tel:'450-555-0400',d:'13 avr'},{n:'Famille Ouellet',s:'Pavé uni',p:4800,src:'Google',tel:'514-555-0500',d:'12 avr'}]},
  {id:'interesse',title:'Intéressé / Semi-close',color:'#f59e0b',deals:[{n:'Gosselin',s:'Fenêtres int/ext',p:420,src:'Ads',tel:'450-555-0600',d:'11 avr'}]},
  {id:'projet',title:'Projet / À soumissioner',color:'#8a9445',deals:[{n:'Denis Lapointe',s:'Pavé uni',p:12000,src:'Référence',tel:'450-555-0800',d:'9 avr'}]},
  {id:'visit',title:'Site Visit Required',color:'#a0713a',deals:[{n:'Imm. Bertrand',s:'Comm. fenêtres',p:1200,src:'Ads',tel:'450-555-0900',d:'8 avr'}]},
  {id:'devis',title:'Devis envoyé',color:'#3aafb0',deals:[{n:'Pierre Gagnon',s:'Fenêtres int/ext',p:450,src:'D2D',tel:'514-555-1000',d:'7 avr'}]},
  {id:'closed-v',title:'Deal CLOSED — Fenêtres',color:'#22c55e',deals:[{n:'Famille Tremblay',s:'Fenêtres ext.',p:280,src:'Ads',tel:'514-555-1100',d:'5 avr'},{n:'Charron',s:'Fenêtres ext.',p:230,src:'D2D',tel:'450-555-1200',d:'4 avr'}]},
  {id:'closed-g',title:'Deal CLOSED — Gazon',color:'#16a34a',deals:[{n:'Famille Simard',s:'Tonte saison.',p:600,src:'Flyers',tel:'514-555-1300',d:'4 avr'}]},
  {id:'completed',title:'Job Completed',color:'#059669',deals:[{n:'Bergeron',s:'Fenêtres ext.',p:195,src:'Ads',tel:'450-555-1400',d:'14 avr'}]},
  {id:'followup',title:'Follow up autres projets',color:'#8b5cf6',deals:[{n:'Famille Ouellet',s:'Pavé — 2027',p:0,src:'Référence',tel:'514-555-1500',d:'10 avr'}]},
  {id:'nextyear',title:'Pas de réponse (next year)',color:'#64748b',deals:[{n:'Chantal Morin',s:'Fenêtres ext.',p:180,src:'D2D',tel:'450-555-1600',d:'8 avr'}]},
  {id:'lost',title:'Deal Lost',color:'#ef4444',deals:[{n:'Résidence Lafleur',s:'Fenêtres int/ext',p:380,src:'Ads',tel:'514-555-1700',d:'3 avr'}]},
];

const FB_PIPE_REPS = {
  nathan:[{id:'n1',title:'Nouveaux D2D',color:'#69C9CA',deals:[{n:'Famille Martin',s:'Fenêtres ext.',p:220,d:'Auj.'},{n:'Leblanc',s:'Tonte',p:90,d:'Auj.'}]},{id:'n2',title:'À rappeler',color:'#f59e0b',deals:[{n:'Bergeron sud',s:'Fenêtres int/ext',p:350,d:'Hier'}]},{id:'n3',title:'Soumission envoyée',color:'#3aafb0',deals:[{n:'Marc Lévesque',s:'Ouverture',p:275,d:'13 avr'}]},{id:'n4',title:'Closé',color:'#22c55e',deals:[{n:'Sophie Bergeron',s:'Fenêtres ext.',p:350,d:'13 avr'},{n:'Denis Lapointe',s:'Tonte+ouverture',p:390,d:'12 avr'}]},{id:'n5',title:'Pas intéressé',color:'#ef4444',deals:[{n:'Résidence Nord',s:'Fenêtres ext.',p:180,d:'12 avr'}]}],
  maxime_s:[{id:'ms1',title:'Nouveaux D2D',color:'#69C9CA',deals:[{n:'Famille Bouchard',s:'Fenêtres ext.',p:195,d:'Auj.'}]},{id:'ms2',title:'À rappeler',color:'#f59e0b',deals:[{n:'Résidence Charest',s:'Tonte',p:600,d:'Hier'}]},{id:'ms3',title:'Soumission envoyée',color:'#3aafb0',deals:[{n:'Gagnon Est',s:'Fenêtres ext.',p:210,d:'13 avr'}]},{id:'ms4',title:'Closé',color:'#22c55e',deals:[{n:'Famille Boisvert',s:'Tonte saison.',p:600,d:'12 avr'}]},{id:'ms5',title:'Pas intéressé',color:'#ef4444',deals:[]}],
  marc_y:[{id:'my1',title:'Nouveaux D2D',color:'#69C9CA',deals:[{n:'Famille Dupuis',s:'Fenêtres ext.',p:185,d:'Auj.'}]},{id:'my2',title:'À rappeler',color:'#f59e0b',deals:[{n:'Côté Nord',s:'Fenêtres int/ext',p:310,d:'Hier'}]},{id:'my3',title:'Soumission',color:'#3aafb0',deals:[]},{id:'my4',title:'Closé',color:'#22c55e',deals:[{n:'Famille Tardif',s:'Ouverture+tonte',p:350,d:'11 avr'}]},{id:'my5',title:'Pas intéressé',color:'#ef4444',deals:[]}],
  willl:[{id:'w1',title:'Nouveaux',color:'#69C9CA',deals:[{n:'Imm. Sorel',s:'Comm. fenêtres',p:2200,d:'Auj.'}]},{id:'w2',title:'En contact',color:'#94a3b8',deals:[{n:'Résidence Park',s:'Fenêtres int/ext',p:480,d:'Hier'}]},{id:'w3',title:'Devis envoyé',color:'#3aafb0',deals:[{n:'Gosselin',s:'Fenêtres int/ext',p:420,d:'11 avr'}]},{id:'w4',title:'Closé',color:'#22c55e',deals:[{n:'Pierre Gagnon',s:'Fenêtres ext.',p:450,d:'10 avr'}]},{id:'w5',title:'Deal Lost',color:'#ef4444',deals:[]}],
};

const FB_GAZON_EMP = [
  {id:'edouard', name:'Édouard Dufault',     days:[{j:'Lun 14',in:'7h58',out:'16h12',h:8.23,jobs:'Route A'},{j:'Mar 15',in:'8h02',out:'15h45',h:7.72,jobs:'Route B'},{j:'Mer 16',in:'8h00',out:'16h30',h:8.5,jobs:'Route A'},{j:'Jeu 17',in:null,out:null,h:0,jobs:'Indispo'},{j:'Ven 18',in:'8h05',out:'16h00',h:7.92,jobs:'Route C'},{j:'Sam 19',in:'8h00',out:'13h30',h:5.5,jobs:'Route B'}]},
  {id:'laurier', name:'Laurier St-Germain',  days:[{j:'Lun 14',in:'8h00',out:'16h00',h:8,jobs:'Route B'},{j:'Mar 15',in:'8h10',out:'15h50',h:7.67,jobs:'Route A'},{j:'Mer 16',in:'8h00',out:'15h30',h:7.5,jobs:'Ouverture Roy'},{j:'Jeu 17',in:'8h05',out:'16h05',h:8,jobs:'Route C'},{j:'Ven 18',in:'8h00',out:'15h45',h:7.75,jobs:'Route B'},{j:'Sam 19',in:null,out:null,h:0,jobs:'Repos'}]},
  {id:'justin',  name:'Justin Barrière',     days:[{j:'Lun 14',in:'8h00',out:'15h30',h:7.5,jobs:'Route C'},{j:'Mar 15',in:'8h00',out:'16h00',h:8,jobs:'Ouverture Gosselin'},{j:'Mer 16',in:'8h00',out:'16h30',h:8.5,jobs:'Route A'},{j:'Jeu 17',in:'8h00',out:'15h00',h:7,jobs:'Route B'},{j:'Ven 18',in:'8h00',out:'16h00',h:8,jobs:'Route C'},{j:'Sam 19',in:null,out:null,h:0,jobs:'Repos'}]},
  {id:'maxime_b',name:'Maxime Beaupré',      days:[{j:'Lun 14',in:'8h00',out:'16h00',h:8,jobs:'Route A'},{j:'Mar 15',in:'8h00',out:'16h00',h:8,jobs:'Route C'},{j:'Mer 16',in:'8h00',out:'16h00',h:8,jobs:'Route B'},{j:'Jeu 17',in:'8h00',out:'16h00',h:8,jobs:'Ouverture Tremblay'},{j:'Ven 18',in:'8h00',out:'15h30',h:7.5,jobs:'Route A'},{j:'Sam 19',in:null,out:null,h:0,jobs:'Repos'}]},
  {id:'otavio',  name:'Otavio Haygert Roxo', days:[{j:'Lun 14',in:'8h05',out:'16h05',h:8,jobs:'Route B'},{j:'Mar 15',in:'8h00',out:'15h45',h:7.75,jobs:'Route A'},{j:'Mer 16',in:'8h00',out:'16h15',h:8.25,jobs:'Route C'},{j:'Jeu 17',in:'8h00',out:'16h00',h:8,jobs:'Ouverture Gosselin'},{j:'Ven 18',in:'8h00',out:'16h00',h:8,jobs:'Route B'},{j:'Sam 19',in:null,out:null,h:0,jobs:'Repos'}]},
  {id:'xavier',  name:'Xavier Chagnon',      days:[{j:'Lun 14',in:'8h00',out:'15h30',h:7.5,jobs:'Route C'},{j:'Mar 15',in:'8h00',out:'16h00',h:8,jobs:'Route B'},{j:'Mer 16',in:'8h00',out:'15h45',h:7.75,jobs:'Route A'},{j:'Jeu 17',in:null,out:null,h:0,jobs:'Indispo'},{j:'Ven 18',in:'8h00',out:'16h00',h:8,jobs:'Route C'},{j:'Sam 19',in:'8h00',out:'12h00',h:4,jobs:'Haies'}]},
  {id:'marc',    name:'Marc Yankov',          days:[{j:'Lun 14',in:'8h00',out:'16h00',h:8,jobs:'Route A'},{j:'Mar 15',in:'8h00',out:'16h00',h:8,jobs:'Route C'},{j:'Mer 16',in:'8h00',out:'16h00',h:8,jobs:'Route B'},{j:'Jeu 17',in:'8h00',out:'15h00',h:7,jobs:'Ouverture client'},{j:'Ven 18',in:'8h00',out:'15h30',h:7.5,jobs:'Route A'},{j:'Sam 19',in:null,out:null,h:0,jobs:'Repos'}]},
  {id:'adrian',  name:'Adrian Bonspille',    days:[{j:'Lun 14',in:'8h00',out:'16h00',h:8,jobs:'Route A'},{j:'Mar 15',in:'8h00',out:'16h00',h:8,jobs:'Route C'},{j:'Mer 16',in:'8h00',out:'16h00',h:8,jobs:'Ouverture Roy'},{j:'Jeu 17',in:'8h00',out:'15h30',h:7.5,jobs:'Route B'},{j:'Ven 18',in:'8h00',out:'16h00',h:8,jobs:'Route A'},{j:'Sam 19',in:null,out:null,h:0,jobs:'Repos'}]},
  {id:'felix',   name:'Félix-Antoine Scully',days:[{j:'Lun 14',in:'8h00',out:'15h00',h:7,jobs:'Route B'},{j:'Mar 15',in:'8h00',out:'16h00',h:8,jobs:'Route A'},{j:'Mer 16',in:'8h00',out:'16h00',h:8,jobs:'Route C'},{j:'Jeu 17',in:'8h00',out:'16h30',h:8.5,jobs:'Ouverture Gosselin'},{j:'Ven 18',in:'8h00',out:'15h45',h:7.75,jobs:'Route B'},{j:'Sam 19',in:null,out:null,h:0,jobs:'Repos'}]},
];

const FB_CLIENTS = [
  {id:1,name:'Famille Tremblay',addr:'245 rue Cartier, Longueuil',tel:'514-555-0182',email:'tremblay@email.com',svcs:['Fenêtres ext.'],vitres:24,notes:'Entrée côté gauche. Chien attaché.',contrats:[{date:'2024-04-15',svc:'Fenêtres ext.',prix:265,statut:'Payé'},{date:'2023-04-20',svc:'Fenêtres ext.',prix:250,statut:'Payé'}]},
  {id:2,name:'Famille Gosselin',addr:'421 boul. Taschereau, Brossard',tel:'450-555-0291',email:'gosselin@email.com',svcs:['Fenêtres int/ext'],vitres:32,notes:'Clé sous le paillasson.',contrats:[{date:'2024-04-13',svc:'Fenêtres int/ext',prix:420,statut:'Envoyé'}]},
  {id:3,name:'Pierre Gagnon',addr:'89 rue Ste-Hélène, Longueuil',tel:'514-555-0419',email:'gagnon@email.com',svcs:['Fenêtres int/ext','Tonte'],vitres:28,pi:2400,notes:'Prise eau dans le garage.',contrats:[{date:'2024-04-10',svc:'Fenêtres int/ext',prix:450,statut:'Signé'}]},
  {id:4,name:'Johanne Pelletier',addr:'67 rue St-Charles, Longueuil',tel:'514-555-0856',email:'pelletier@email.com',svcs:['Tonte saisonnière'],pi:3100,notes:'Faire le tour du cabanon.',contrats:[{date:'2024-05-01',svc:'Tonte saisonnière',prix:650,statut:'Actif'}]},
  {id:5,name:'Immeuble Bertrand',addr:'1240 boul. Lapinière, Brossard',tel:'450-555-1100',email:'admin@bertrand.ca',svcs:['Fenêtres commercial'],vitres:120,notes:'Commercial — 3 étages.',contrats:[{date:'2024-04-09',svc:'Fenêtres commercial',prix:1200,statut:'À confirmer'}]},
];

const FB_PERF = {
  nathan:  {name:'Nathan Quintal',  ventes:2340,portes:87,closes:13,taux:16,comm:304},
  maxime_s:{name:'Maxime Santander',ventes:1820,portes:72,closes:9, taux:12,comm:237},
  marc_y:  {name:'Marc Yankov',     ventes:1450,portes:61,closes:7, taux:11,comm:189},
  will:    {name:'Will Lowe',       ventes:1820,portes:0, closes:8, taux:0, comm:419},
};

const SMS_TPL = {
  eta:    "Bonjour! L'équipe MW Multiservices est en route, arrivée dans ~30 min. À bientôt!",
  arrive: "Bonjour! L'équipe MW Multiservices est maintenant chez vous. Bonne journée!",
  rappel: "Rappel: votre rendez-vous MW Multiservices est demain. Questions? 438-391-8780",
  review: "Merci pour votre confiance! Votre avis nous aide: https://share.google/CrlBX54OzZ2hFcsqS ⭐",
};

// ════════════════════════════════════════════
// STATE
// ════════════════════════════════════════════
let curUser    = null;
let curLead    = null;
let curClockId = null;
let clockedIn  = false;
let clockInTime= null;
let PAY        = {};
let _clients   = FB_CLIENTS;
let _leads     = [];
let USER_DB_IDS= {}; // username → uuid
let USER_NAMES = {}; // uuid → full_name

// ════════════════════════════════════════════
// UTILS
// ════════════════════════════════════════════
function getDate(){const d=new Date();const days=['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];const months=['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'];return days[d.getDay()]+' '+d.getDate()+' '+months[d.getMonth()]}
function getGreeting(){const h=new Date().getHours();return h<12?'Bonjour,':h<18?'Bon après-midi,':'Bonsoir,'}
function getNavKey(u){return(u.role==='rep'&&u.secondary==='terrain')?'rep_terrain':u.role}
function toast(msg,err=false){const t=document.getElementById('toast');t.textContent=msg;t.style.background=err?'rgba(239,68,68,.15)':'rgba(34,197,94,.15)';t.style.borderColor=err?'rgba(239,68,68,.3)':'rgba(34,197,94,.3)';t.style.color=err?'var(--red)':'var(--green)';t.classList.add('show');setTimeout(()=>t.classList.remove('show'),2800)}
function esc(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function weekStart(){const d=new Date();const diff=d.getDate()-(d.getDay()===0?6:d.getDay()-1);return new Date(d.getFullYear(),d.getMonth(),diff).toISOString().slice(0,10)}
function fmtTime(ts){if(!ts)return'—';const d=new Date(ts);return d.getHours().toString().padStart(2,'0')+'h'+d.getMinutes().toString().padStart(2,'0')}
function fmtDate(ts){if(!ts)return'—';const d=new Date(ts);const days=['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];return days[d.getDay()]+' '+d.getDate()}
function fmtRelDate(ts){if(!ts)return'';const d=new Date(ts);const now=new Date();const diff=Math.floor((now-d)/86400000);return diff===0?'Auj.':diff===1?'Hier':(d.getDate()+' '+(d.toLocaleString('fr',{month:'short'})))}
async function supa(fn){try{return await fn()}catch(e){console.warn('Supabase:',e.message||e);return null}}
async function loadUserIds(){const res=await supa(()=>db.from('users').select('id,username,full_name'));if(res?.data){res.data.forEach(u=>{USER_DB_IDS[u.username]=u.id;USER_NAMES[u.id]=u.full_name;})}}

// ════════════════════════════════════════════
// LOGIN
// ════════════════════════════════════════════
function buildDemoGrid(){
  const g=document.getElementById('demo-grid');
  g.innerHTML=DEMO.map(a=>`<div class="da" onclick="fl('${a.u}')"><div class="da-dot" style="background:${a.c}"></div><div><div class="da-name">${a.n}</div><div class="da-role">${a.r}</div></div></div>`).join('');
}
function fl(u){document.getElementById('l-user').value=u;document.getElementById('l-pass').value=USERS[u]?.pass||''}

function doLogin(){
  const u=document.getElementById('l-user').value.trim().toLowerCase();
  const p=document.getElementById('l-pass').value;
  const user=USERS[u];
  if(!user||user.pass!==p){document.getElementById('l-err').textContent='Identifiants incorrects.';return}
  document.getElementById('l-err').textContent='';
  curUser={...user,username:u};
  const info=SPLASH_INFO[user.role]||SPLASH_INFO.admin;
  document.getElementById('sp-badge').textContent=info.badge;
  document.getElementById('sp-greet').textContent=info.greet;
  const splash=document.getElementById('splash');
  splash.style.display='flex';
  setTimeout(()=>document.getElementById('sp-bar').style.width='100%',100);
  setTimeout(()=>{
    splash.classList.add('hide');
    setTimeout(()=>{splash.style.display='none';splash.classList.remove('hide');launchApp(curUser)},500);
  },1600);
}

function doLogout(){
  curUser=null;curLead=null;
  if(window._rt){try{window._rt.unsubscribe()}catch(e){}}
  document.getElementById('app').classList.remove('show');
  document.getElementById('login-screen').style.display='flex';
  document.getElementById('sp-bar').style.width='0';
}

// ════════════════════════════════════════════
// APP LAUNCH
// ════════════════════════════════════════════
async function launchApp(user){
  document.getElementById('login-screen').style.display='none';
  document.getElementById('app').classList.add('show');
  document.getElementById('tb-av').textContent=user.av;
  document.getElementById('tb-name').textContent=user.name;
  const rb=document.getElementById('tb-role');rb.textContent=user.rl;rb.className='rb '+user.rc;
  document.getElementById('tb-date').textContent=getDate();
  buildSidebar(user);
  await loadUserIds();
  curUser.db_id=USER_DB_IDS[user.username]||null;
  initPages(user);
  const nk=getNavKey(user);
  showPg(NAV[nk][0].i[0].id);
  startClock();
  setupRealtime(user);
}

function buildSidebar(user){
  const sb=document.getElementById('sidebar');
  const nk=getNavKey(user);
  const cfg=NAV[nk]||NAV.admin;
  sb.innerHTML=cfg.map(sec=>`
    <div class="sb-sec">${sec.s}</div>
    ${sec.i.map((item,i)=>`<div class="ni ni-s" data-id="${item.id}" style="animation-delay:${i*0.05+0.08}s" onclick="showPg('${item.id}')"><span class="ni-ic">${item.ic}</span><span class="ni-label">${item.l}</span></div>`).join('')}
  `).join('');
}

function showPg(id){
  document.querySelectorAll('.pg').forEach(p=>p.classList.remove('act'));
  document.querySelectorAll('.ni').forEach(n=>n.classList.remove('act'));
  const pg=document.getElementById('pg-'+id);
  if(pg)pg.classList.add('act');
  document.querySelectorAll(`[data-id="${id}"]`).forEach(n=>n.classList.add('act'));
}

function switchTab(group,id,el){
  document.querySelectorAll('[id^="'+group+'-"]').forEach(t=>t.style.display='none');
  const t=document.getElementById(group+'-'+id.replace(group+'-',''));if(t)t.style.display='block';
  const t2=document.getElementById(id);if(t2)t2.style.display='block';
  el.closest('.tabs').querySelectorAll('.tab').forEach(t=>t.classList.remove('act'));
  el.classList.add('act');
}

// ════════════════════════════════════════════
// INIT PAGES
// ════════════════════════════════════════════
async function initPages(user){
  customizeTitles(user);
  loadDashCards();
  loadClientsList();
  loadPipeMW();
  loadRepPipe('nathan');
  loadPersoPipe(user);
  loadAdminComm();
  loadPersonalComm(user);
  loadPersonalPaye(user);
  loadSousHist(user);
  loadPerf('nathan');
  loadClockStatus(user);
}

// ════════════════════════════════════════════
// DASHBOARD
// ════════════════════════════════════════════
async function loadDashCards(){
  const el=document.getElementById('dash-cards');if(!el)return;
  let cards;
  const r=await supa(()=>Promise.all([
    db.from('leads').select('pipeline_stage',{count:'exact',head:true}).eq('pipeline_stage','new'),
    db.from('jobs').select('id',{count:'exact',head:true}).gte('created_at',weekStart()),
    db.from('quotes').select('id',{count:'exact',head:true}).eq('status','sent'),
    db.from('quotes').select('id',{count:'exact',head:true}).eq('status','signed'),
  ]));
  if(r&&!r[0].error){
    cards=[
      {ic:'📋',label:'Nouvelles demandes',n:r[0].count||0,s:'En attente de contact',d:'Pipeline MW',c:'var(--amber)'},
      {ic:'🔧',label:'Jobs cette semaine',n:r[1].count||0,s:'Tous secteurs',d:'Complétés + en cours',c:'var(--ol)'},
      {ic:'📄',label:'Soumissions envoyées',n:r[2].count||0,s:'En attente client',d:'Approbation requise',c:'var(--teal)'},
      {ic:'💰',label:'Contrats signés',n:r[3].count||0,s:'À facturer',d:'QuickBooks',c:'var(--blue)'},
    ];
  } else {
    cards=[
      {ic:'📋',label:'Demandes',n:3,s:'Nouvelles',d:'Évaluations: 1 · En retard: 1',c:'var(--amber)'},
      {ic:'📄',label:'Soumissions',n:5,s:'Approuvées',d:'Brouillons: 2 · Modif.: 1',c:'var(--teal)'},
      {ic:'🔧',label:'Jobs',n:8,s:'Actifs aujourd\'hui',d:'Complétés: 3 · Action: 1',c:'var(--ol)'},
      {ic:'💰',label:'Factures',n:4,s:'En attente',d:'Brouillons: 1',c:'var(--blue)'},
    ];
  }
  el.innerHTML=cards.map((c,i)=>`
    <div class="card" style="border-top:3px solid ${c.c};padding:13px;animation-delay:${i*0.05+0.05}s">
      <div style="font-size:10px;color:var(--tx4);font-weight:600;margin-bottom:7px">${c.ic} ${c.label}</div>
      <div style="font-size:30px;font-weight:800;line-height:1;margin-bottom:3px">${c.n}</div>
      <div style="font-size:12px;font-weight:700;color:var(--tx2);margin-bottom:4px">${c.s}</div>
      <div style="font-size:11px;color:var(--tx4)">${c.d}</div>
    </div>`).join('');
}

async function loadPerf(key){
  const el=document.getElementById('perf-view');if(!el)return;
  const uname=REP_USERNAME[key];
  const uid=USER_DB_IDS[uname];
  const res=uid?await supa(()=>db.from('commissions')
    .select('base_amount,commission_amount,bonus_amount,rate')
    .eq('user_id',uid).eq('week_start',weekStart()).maybeSingle()):null;
  let d;
  if(res&&res.data){
    const c=res.data;
    d={name:FB_PERF[key]?.name||uname,ventes:c.base_amount||0,portes:0,closes:0,taux:c.rate||0,comm:c.commission_amount||0};
  } else {
    d=FB_PERF[key]||FB_PERF.nathan;
  }
  el.innerHTML=`
    <div style="font-size:13px;font-weight:700;margin-bottom:8px">${d.name}</div>
    <div class="g4" style="margin-bottom:0">
      <div class="stat-card"><div class="stat-l">Ventes</div><div class="stat-v" style="color:var(--teal);font-size:17px">$${(d.ventes||0).toLocaleString()}</div></div>
      ${d.portes>0?`<div class="stat-card"><div class="stat-l">Portes</div><div class="stat-v" style="font-size:17px">${d.portes}</div></div>`:`<div class="stat-card"><div class="stat-l">Source</div><div class="stat-v" style="font-size:13px">Pipeline</div></div>`}
      <div class="stat-card"><div class="stat-l">Closes</div><div class="stat-v" style="font-size:17px">${d.closes}</div></div>
      ${d.taux>0?`<div class="stat-card"><div class="stat-l">Taux</div><div class="stat-v" style="font-size:17px;color:var(--ol)">${d.taux}%</div></div>`:`<div class="stat-card"><div class="stat-l">Commission</div><div class="stat-v" style="font-size:17px;color:var(--teal)">$${d.comm}</div></div>`}
    </div>`;
}
function renderPerf(key){loadPerf(key)}

// ════════════════════════════════════════════
// CLIENTS
// ════════════════════════════════════════════
async function loadClientsList(){
  const res=await supa(()=>db.from('clients').select('*').order('full_name'));
  if(res&&res.data&&res.data.length){
    _clients=res.data.map(c=>({
      id:c.id,name:c.full_name||'',addr:c.address||'',tel:c.phone||'',email:c.email||'',
      svcs:c.service_type?[c.service_type]:[],vitres:c.nb_vitres||null,pi:c.superficie_pi2||null,
      notes:c.notes||'',contrats:[],
    }));
  }
  renderClientsList();
}

function renderClientsList(filter=''){
  const el=document.getElementById('clients-list');if(!el)return;
  const list=filter?_clients.filter(c=>c.name.toLowerCase().includes(filter.toLowerCase())||c.addr.toLowerCase().includes(filter.toLowerCase())):_clients;
  el.innerHTML=list.map((c,i)=>`
    <div class="cl-row" onclick="showClient(${i})">
      <div class="cl-av">${c.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>
      <div><div style="font-size:13px;font-weight:600;color:var(--tx)">${esc(c.name)}</div><div class="tsm">${esc(c.addr)}</div></div>
      <div style="font-size:10px;color:var(--tx4)">${c.svcs&&c.svcs[0]||''}</div>
      <span class="badge bg" style="font-size:9px">QB ✓</span>
    </div>`).join('')||'<div style="font-size:12px;color:var(--tx4);padding:16px;text-align:center">Aucun client trouvé</div>';
}

function showClient(i){
  const c=_clients[i];if(!c)return;
  document.getElementById('client-detail').innerHTML=`
    <div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">
      <div class="cl-av" style="width:36px;height:36px;font-size:13px">${c.name.split(' ').map(w=>w[0]).join('').slice(0,2)}</div>
      <div><div style="font-size:14px;font-weight:800">${esc(c.name)}</div><div class="tsm">${esc(c.addr)}</div></div>
      <span class="badge bg" style="margin-left:auto;font-size:9px">QB ✓</span>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:5px;margin-bottom:10px">
      <div style="background:var(--s2);border-radius:var(--rm);padding:7px 9px;font-size:10px;color:var(--tx4)">📞 ${c.tel}</div>
      <div style="background:var(--s2);border-radius:var(--rm);padding:7px 9px;font-size:10px;color:var(--tx4)">✉️ ${c.email}</div>
    </div>
    ${c.vitres?`<div style="background:var(--tl);border-radius:var(--rm);padding:7px 9px;font-size:11px;color:var(--td);margin-bottom:7px;border:0.5px solid rgba(105,201,202,.15)">🪟 ${c.vitres} vitres</div>`:''}
    ${c.pi?`<div style="background:rgba(105,112,53,.12);border-radius:var(--rm);padding:7px 9px;font-size:11px;color:var(--ol);margin-bottom:7px;border:0.5px solid rgba(105,112,53,.15)">🌿 ${c.pi.toLocaleString()} pi²</div>`:''}
    ${c.notes?`<div style="background:var(--s2);border-radius:var(--rm);padding:7px 9px;font-size:11px;color:var(--tx3);margin-bottom:10px">${esc(c.notes)}</div>`:''}
    <div style="display:flex;gap:6px;margin-bottom:10px">
      <button class="btn btn-t" style="flex:1;font-size:11px" onclick="alert('SMS: '+${JSON.stringify(c.tel)})">📱 SMS</button>
      <button class="btn btn-w" style="flex:1;font-size:11px" onclick="showPg('soumissions')">📄 Soumission</button>
    </div>
    <div style="font-size:10px;color:var(--tx4);font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin-bottom:5px">Historique contrats</div>
    ${(c.contrats&&c.contrats.length)?c.contrats.map(ct=>`
      <div style="display:flex;justify-content:space-between;padding:6px 9px;background:var(--s2);border-radius:var(--rm);margin-bottom:3px;font-size:11px">
        <div><div style="font-weight:600">${ct.svc||ct.service_type||''}</div><div class="tsm">${ct.date||''}</div></div>
        <div style="text-align:right"><div style="font-weight:700;color:var(--teal)">$${ct.prix||ct.price||0}</div><span class="badge ${ct.statut==='Payé'||ct.status==='paid'?'bg':ct.statut==='Actif'||ct.status==='active'?'bt':'ba'}" style="font-size:9px">${ct.statut||ct.status||''}</span></div>
      </div>`).join(''):'<div style="font-size:11px;color:var(--tx4)">Aucun contrat</div>'}`;
}

async function saveClient(){
  const modal=document.getElementById('nc-modal');
  const inputs=modal.querySelectorAll('input,textarea');
  const chips=[...modal.querySelectorAll('.chip.on')].map(c=>c.textContent);
  const fname=inputs[0].value.trim();
  const lname=inputs[1].value.trim();
  const addr=inputs[2].value.trim();
  const phone=inputs[3].value.trim();
  const email=inputs[4].value.trim();
  const notes=inputs[5]?.value.trim()||'';
  if(!fname||!lname){toast('Prénom et nom requis',true);return}
  const name=fname+' '+lname;
  const res=await supa(()=>db.from('clients').insert({full_name:name,address:addr,phone,email,notes,service_type:chips[0]||null}).select().single());
  if(res&&res.data){
    _clients.unshift({id:res.data.id,name,addr,tel:phone,email,svcs:chips,notes,contrats:[]});
    renderClientsList();
    toast('✓ Client créé — sync QB en cours');
  } else {
    _clients.unshift({id:Date.now(),name,addr,tel:phone,email,svcs:chips,notes,contrats:[]});
    renderClientsList();
    toast('✓ Client ajouté localement');
  }
  inputs.forEach(i=>i.value='');
  modal.querySelectorAll('.chip.on').forEach(c=>c.classList.remove('on'));
  setTimeout(()=>modal.classList.remove('show'),200);
}

// ════════════════════════════════════════════
// PIPELINE — helpers communs
// ════════════════════════════════════════════
const STAGE_CONFIG = [
  {id:'new',       title:'New Leads',                  color:'#69C9CA'},
  {id:'contact',   title:'Attempted Contact',           color:'#94a3b8'},
  {id:'interesse', title:'Intéressé / Semi-close',      color:'#f59e0b'},
  {id:'projet',    title:'Projet / À soumissioner',     color:'#8a9445'},
  {id:'visit',     title:'Site Visit Required',         color:'#a0713a'},
  {id:'devis',     title:'Devis envoyé',                color:'#3aafb0'},
  {id:'closed-v',  title:'Deal CLOSED — Fenêtres',      color:'#22c55e'},
  {id:'closed-g',  title:'Deal CLOSED — Gazon',         color:'#16a34a'},
  {id:'completed', title:'Job Completed',               color:'#059669'},
  {id:'followup',  title:'Follow up autres projets',    color:'#8b5cf6'},
  {id:'nextyear',  title:'Pas de réponse (next year)',  color:'#64748b'},
  {id:'lost',      title:'Deal Lost',                   color:'#ef4444'},
];

function leadsToColumns(leads){
  return STAGE_CONFIG.map(s=>({
    ...s,
    deals:leads.filter(l=>l.pipeline_stage===s.id).map(l=>({
      _id:l.id,n:l.full_name||l.name||'',s:l.service_interest||'',
      p:l.estimated_value||0,src:l.source||'',tel:l.phone||'',
      d:fmtRelDate(l.created_at),rep:USER_NAMES[l.owner_id]||'',
    })),
  }));
}

// ════════════════════════════════════════════
// PIPELINE MW
// ════════════════════════════════════════════
async function loadPipeMW(){
  const res=await supa(()=>db.from('leads').select('*').order('created_at',{ascending:false}));
  const data=(res&&res.data&&res.data.length)?leadsToColumns(res.data):FB_PIPE_MW;
  _leads=res?.data||[];
  buildPipeBoard('pipe-mw',data,selectLead);
}

async function loadRepPipe(key){
  const uname=REP_USERNAME[key];
  let data;
  if(uname){
    const uid=USER_DB_IDS[uname];
    const res=uid?await supa(()=>db.from('leads').select('*').eq('owner_id',uid).order('created_at',{ascending:false})):null;
    if(res&&res.data&&res.data.length){
      const d2dStages=['new','contact','interesse','devis','closed-v','closed-g','nextyear','lost'];
      data=d2dStages.map(sid=>{
        const sc=STAGE_CONFIG.find(s=>s.id===sid);
        return{...sc,title:sc.title.replace('Attempted Contact','À rappeler').replace('Intéressé / Semi-close','Semi-close'),
          deals:res.data.filter(l=>l.pipeline_stage===sid).map(l=>({_id:l.id,n:l.full_name||'',s:l.service_interest||'',p:l.estimated_value||0,d:fmtRelDate(l.created_at)}))};
      });
    }
  }
  if(!data)data=FB_PIPE_REPS[key]||FB_PIPE_REPS.nathan;
  buildPipeBoard('pipe-reps',data);
}

async function loadPersoPipe(user){
  let data;
  if(user.role==='tech'){
    data=[{id:'t1',title:'À rappeler',color:'#f59e0b',deals:[{n:'Famille Simard',s:'Fenêtres ext.',p:280,d:'Auj.'},{n:'Bergeron',s:'Fenêtres int/ext',p:395,d:'Hier'}]},{id:'t2',title:'Soumission',color:'#3aafb0',deals:[{n:'Résidence Lapointe',s:'Fenêtres ext.',p:210,d:'13 avr'}]},{id:'t3',title:'Closé',color:'#22c55e',deals:[{n:'Famille Charron',s:'Fenêtres ext.',p:230,d:'12 avr'}]},{id:'t4',title:'Pas intéressé',color:'#ef4444',deals:[]}];
  } else {
    const uid=curUser?.db_id;
    const res=uid?await supa(()=>db.from('leads').select('*').eq('owner_id',uid).order('created_at',{ascending:false})):null;
    if(res&&res.data&&res.data.length){
      const stages=['new','contact','interesse','devis','closed-v','lost'];
      data=stages.map(sid=>{
        const sc=STAGE_CONFIG.find(s=>s.id===sid);
        return{...sc,deals:res.data.filter(l=>l.pipeline_stage===sid).map(l=>({_id:l.id,n:l.full_name||'',s:l.service_interest||'',p:l.estimated_value||0,d:fmtRelDate(l.created_at)}))};
      });
    } else {
      const k=user.name==='Marc Yankov'?'marc_y':user.name==='Maxime Santander'?'maxime_s':user.name==='Will Lowe'?'willl':'nathan';
      data=FB_PIPE_REPS[k]||FB_PIPE_REPS.nathan;
    }
  }
  buildPipeBoard('pipe-perso',data);
}

// ════════════════════════════════════════════
// PIPELINE — rendu
// ════════════════════════════════════════════
function buildPipeBoard(containerId,data,onSelect){
  const el=document.getElementById(containerId);
  if(!el)return;
  el.innerHTML=data.map(col=>{
    const total=col.deals.reduce((s,d)=>s+(d.p||0),0);
    return `<div class="pipe-col">
      <div class="pipe-col-h" style="border-top-color:${col.color}">
        <div class="pct">${col.title.toUpperCase().slice(0,16)}<span class="pcn">${col.deals.length}</span></div>
        <div class="pcv" style="color:${col.color}">${total>0?'$'+total.toLocaleString():''}</div>
      </div>
      <div class="pipe-cards">${col.deals.map(deal=>`
        <div class="pc" onclick="selectLead(${JSON.stringify(deal).replace(/"/g,'&quot;')},this)">
          <div class="pc-n">${esc(deal.n)}</div>
          <div class="pc-s">${esc(deal.s)}</div>
          ${deal.p>0?`<div class="pc-p">$${deal.p.toLocaleString()}</div>`:''}
          <div class="pc-meta"><span class="badge bx" style="font-size:9px">${deal.src||''}</span><span>${deal.d||''}</span></div>
        </div>`).join('')}
      </div>
    </div>`;
  }).join('');
}

function buildPipeMW(){loadPipeMW()}
function buildRepPipe(key){
  if(key==='all'){
    supa(()=>db.from('leads').select('*').not('owner_id','is',null).order('created_at',{ascending:false})).then(res=>{
      const data=(res&&res.data&&res.data.length)?leadsToColumns(res.data):Object.values(FB_PIPE_REPS).flat();
      buildPipeBoard('pipe-reps',data);
    });
  } else {
    loadRepPipe(key);
  }
}
function buildPersoPipe(user){loadPersoPipe(user)}

// ════════════════════════════════════════════
// SMS
// ════════════════════════════════════════════
async function selectLead(deal,el){
  document.querySelectorAll('#pipe-mw .pc').forEach(p=>p.classList.remove('sel'));
  if(el)el.classList.add('sel');
  curLead=deal;
  document.getElementById('sms-name').textContent=deal.n+' — '+deal.s;
  document.getElementById('sms-tel').textContent=deal.tel||'Pas de numéro';
  document.getElementById('sms-empty').style.display='none';
  document.getElementById('sms-abtns').style.display='flex';
  document.getElementById('sms-thread').style.display='block';
  document.getElementById('sms-ia').style.display='flex';
  await loadSmsThread(deal._id);
}

async function loadSmsThread(leadId){
  const el=document.getElementById('sms-thread');if(!el)return;
  if(!leadId){
    el.innerHTML='<div style="font-size:11px;color:var(--tx4);padding:10px;text-align:center">Nouveau lead — aucun historique</div>';
    return;
  }
  const res=await supa(()=>db.from('sms_messages').select('*').eq('lead_id',leadId).order('created_at'));
  const msgs=res?.data||[];
  if(!msgs.length&&curLead){
    el.innerHTML=`<div class="sms-msg out"><div class="sms-bubble out">Bonjour! Merci de votre intérêt pour MW Multiservices. Nous vous contacterons bientôt.</div><div class="sms-time">Auto</div></div>`;
    return;
  }
  el.innerHTML=msgs.map(m=>{
    const dir=m.direction||m.type||'out';
    const t=m.created_at?fmtTime(m.created_at):'';
    return`<div class="sms-msg ${dir}"><div class="sms-bubble ${dir}">${esc(m.message||m.msg)}</div><div class="sms-time">${t}</div></div>`;
  }).join('');
  el.scrollTop=el.scrollHeight;
}

async function addSMS(msg,direction='out'){
  if(!curLead)return;
  const now=new Date();
  const ts=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
  const el=document.getElementById('sms-thread');
  el.innerHTML+=`<div class="sms-msg ${direction}"><div class="sms-bubble ${direction}">${esc(msg)}</div><div class="sms-time">${ts}</div></div>`;
  el.scrollTop=el.scrollHeight;
  if(curLead._id){
    supa(()=>db.from('sms_messages').insert({lead_id:curLead._id,direction,message:msg,phone:curLead.tel||''}));
  }
  toast('✓ SMS envoyé via Twilio (514-603-7555)');
}

function renderThread(){}
function qsms(key){addSMS(SMS_TPL[key])}
function sendSMS(){const i=document.getElementById('sms-inp');if(i.value.trim()){addSMS(i.value.trim());i.value=''}}

// ════════════════════════════════════════════
// COMMISSIONS ADMIN
// ════════════════════════════════════════════
async function loadAdminComm(){
  const repRes=await supa(()=>db.from('commissions')
    .select('*').eq('type','rep').eq('week_start',weekStart()).order('commission_amount',{ascending:false}));
  const repsData=repRes?.data?.map(r=>({...r,username:Object.keys(USER_DB_IDS).find(k=>USER_DB_IDS[k]===r.user_id)||'',name:USER_NAMES[r.user_id]||'',sales_amount:r.base_amount||0,bonus:r.bonus_amount||0,paid:r.status==='paid'}));
  const repsEl=document.getElementById('comm-reps-list');
  if(repsEl){
    const reps=repsData&&repsData.length?repsData:[
      {id:'fb-rep-nathan',username:'nathan.quintal', name:'Nathan Quintal',   role_label:'Rep terrain',              sales_amount:2340,rate:13,commission_amount:304,bonus:0,paid:false},
      {id:'fb-rep-maxime',username:'maxime.santander',name:'Maxime Santander',role_label:'Rep terrain',              sales_amount:1820,rate:13,commission_amount:237,bonus:0,paid:false},
      {id:'fb-rep-marc',  username:'marc.yankov',    name:'Marc Yankov',      role_label:'Rep terrain',              sales_amount:1450,rate:13,commission_amount:189,bonus:0,paid:false},
      {id:'fb-rep-will',  username:'will.lowe',      name:'Will Lowe',        role_label:'Lead · Pipeline+D2D+2% override',sales_amount:1820,rate:13,commission_amount:419,bonus:0,paid:false},
    ];
    repsEl.innerHTML=reps.map(r=>{
      const p=r.paid||PAY[r.id];
      const boni=r.sales_amount>=25000?850:r.sales_amount>=20000?650:r.sales_amount>=15000?500:0;
      return`<div class="crr" id="row-${r.id}">
        <div><div class="tn">${r.name}</div><div class="tsm">${r.role_label||''}</div></div>
        <span>$${(r.sales_amount||0).toLocaleString()}</span>
        <span class="badge bt">${r.rate||13}%</span>
        <span style="font-weight:700;color:var(--teal)">$${(r.commission_amount||0).toLocaleString()}</span>
        <span>${boni>0?`<span class="badge bg" style="font-size:9px">+$${boni}</span>`:'—'}</span>
        <button class="btn btn-pay ${p?'paid':'unpaid'}" id="btn-${r.id}" ${p?'disabled':''} onclick="markPaid(${JSON.stringify(r.id)},${JSON.stringify(r.username)},this)">${p?'Payé ✓':'Marquer payé'}</button>
      </div>`;
    }).join('');
  }

  const techRes=await supa(()=>db.from('commissions')
    .select('*').eq('type','tech').eq('week_start',weekStart()).order('commission_amount',{ascending:false}));
  const techEl=document.getElementById('comm-tech-list');
  if(techEl){
    const techRaw=techRes?.data?.map(r=>({...r,username:Object.keys(USER_DB_IDS).find(k=>USER_DB_IDS[k]===r.user_id)||'',name:USER_NAMES[r.user_id]||'',sales_amount:r.base_amount||0,paid:r.status==='paid'}));
    const techs=techRaw&&techRaw.length?techRaw:[
      {id:'fb-tech-victor', username:'victor.mathieu', name:'Victor Mathieu',  jobs_count:11,sales_amount:3865,commission_amount:696,paid:true},
      {id:'fb-tech-manuel', username:'manuel.martinez',name:'Manuel Martinez', jobs_count:9, sales_amount:3230,commission_amount:581,paid:true},
      {id:'fb-tech-maxime', username:'maxime.jeffrey', name:'Maxime Jeffrey',  jobs_count:7, sales_amount:2450,commission_amount:441,paid:false},
      {id:'fb-tech-vincent',username:'vincent.caya',  name:'Vincent Caya',    jobs_count:6, sales_amount:2100,commission_amount:378,paid:false},
      {id:'fb-tech-charles',username:'charles.yelle', name:'Charles Yelle',   jobs_count:5, sales_amount:1750,commission_amount:315,paid:false},
      {id:'fb-tech-robin',  username:'robin.bousquet',name:'Robin Bousquet',  jobs_count:5, sales_amount:1600,commission_amount:288,paid:false},
    ];
    techEl.innerHTML=techs.map(t=>{
      const p=t.paid||PAY[t.id];
      return`<div class="ctr" id="row-${t.id}">
        <div class="tn">${t.name}</div>
        <span>${t.jobs_count||0}</span>
        <span>$${(t.sales_amount||0).toLocaleString()}</span>
        <span style="font-weight:700;color:var(--teal)">$${(t.commission_amount||0).toLocaleString()}</span>
        <span class="badge ${p?'bg':'ba'}" id="badge-${t.id}">${p?'Payé ✓':'En attente'}</span>
        <button class="btn btn-pay ${p?'paid':'unpaid'}" id="btn-${t.id}" ${p?'disabled':''} onclick="markPaid(${JSON.stringify(t.id)},${JSON.stringify(t.username)},this)">${p?'Payé ✓':'Marquer payé'}</button>
      </div>`;
    }).join('');
  }

  await loadGazonList();
}
function buildAdminComm(){loadAdminComm()}

async function loadGazonList(){
  const el=document.getElementById('gazon-list');if(!el)return;
  const res=await supa(()=>db.from('timesheets')
    .select('*').gte('punch_in',weekStart()+'T00:00:00').order('user_id').order('punch_in'));
  let emps;
  if(res?.data&&res.data.length){
    const byUser={};
    for(const row of res.data){
      const k=row.user_id;
      const uname=USER_NAMES[k]||k;
      if(!byUser[k])byUser[k]={id:k,name:uname,paid:row.paid,rows:[]};
      byUser[k].rows.push(row);
    }
    emps=Object.values(byUser).map(u=>{
      const days=u.rows.map(r=>({
        j:fmtDate(r.punch_in),
        in:fmtTime(r.punch_in),
        out:fmtTime(r.punch_out),
        h:parseFloat(r.hours_worked||0),
        jobs:'',
        _id:r.id,paid:r.paid,
      }));
      return{id:u.id,name:u.name,days,paid:u.rows.some(r=>r.paid)};
    });
  } else {
    emps=FB_GAZON_EMP;
  }
  el.innerHTML=emps.map(emp=>{
    const totalH=emp.days.reduce((s,d)=>s+(d.h||0),0);
    const paye=(totalH*20).toFixed(2);
    const paid=emp.paid||PAY['gazon-'+emp.id];
    return`<div class="pay-row" id="payrow-${emp.id}">
      <div class="pay-h" onclick="togglePay('${emp.id}')">
        <div><div style="font-size:13px;font-weight:700;color:var(--tx)">${esc(emp.name)}</div><div class="tsm">Paysagement</div></div>
        <span style="font-size:11px;color:var(--tx3)">${totalH.toFixed(1)}h</span>
        <span style="font-size:13px;font-weight:700;color:var(--ol)">$${paye}</span>
        <span style="font-size:10px;color:var(--tx4)">20$/h</span>
        <span class="badge ${paid?'bg':'ba'}" id="gbadge-${emp.id}">${paid?'Payé ✓':'En attente'}</span>
        <button class="btn btn-pay ${paid?'paid':'unpaid'}" id="gbtn-${emp.id}" ${paid?'disabled':''} onclick="event.stopPropagation();markGazon(${JSON.stringify(emp.id)},${JSON.stringify(emp.name)},this)">${paid?'Payé ✓':'Marquer payé'}</button>
      </div>
      <div class="pay-d" id="payd-${emp.id}">
        <div class="pay-day" style="font-size:9px;color:var(--tx4);font-weight:700;text-transform:uppercase;padding:5px 0"><span>Jour</span><span>Arrivée</span><span>Départ</span><span>Jobs</span><span style="text-align:right">Heures</span></div>
        ${emp.days.map(d=>`<div class="pay-day">
          <span style="font-weight:600;color:var(--tx)">${d.j}</span>
          <span style="color:var(--tx3)">${d.in||'—'}</span>
          <span style="color:var(--tx3)">${d.out||'—'}</span>
          <span class="tsm">${esc(d.jobs)}</span>
          <span style="font-weight:700;color:${(d.h||0)>0?'var(--ol)':'var(--tx4)'};text-align:right">${(d.h||0)>0?d.h+'h':'—'}</span>
        </div>`).join('')}
        <div style="border-top:0.5px solid var(--bd);padding-top:8px;margin-top:4px;display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:12px;color:var(--tx4);font-weight:600">Total: ${totalH.toFixed(1)}h × 20$/h</span>
          <span style="font-size:16px;font-weight:800;color:var(--ol)">$${paye}</span>
        </div>
      </div>
    </div>`;
  }).join('');
}

function togglePay(id){const el=document.getElementById('payd-'+id);if(el)el.classList.toggle('open')}

async function markPaid(id,username,btn){
  PAY[id]=true;
  btn.textContent='Payé ✓';btn.className='btn btn-pay paid';btn.disabled=true;
  const badge=document.getElementById('badge-'+id);
  if(badge){badge.className='badge bg';badge.textContent='Payé ✓'}
  const uid=USER_DB_IDS[username];
  if(uid)await supa(()=>db.from('commissions').update({status:'paid',paid_at:new Date().toISOString()})
    .eq('user_id',uid).eq('week_start',weekStart()));
  toast('✓ Paiement enregistré — l\'employé voit Payé ✓ de son côté');
}

async function markGazon(empId,empName,btn){
  PAY['gazon-'+empId]=true;
  btn.textContent='Payé ✓';btn.className='btn btn-pay paid';btn.disabled=true;
  const badge=document.getElementById('gbadge-'+empId);
  if(badge){badge.className='badge bg';badge.textContent='Payé ✓'}
  const uid=Object.keys(USER_NAMES).find(k=>USER_NAMES[k]===empName)||empId;
  await supa(()=>db.from('timesheets').update({paid:true,paid_at:new Date().toISOString()})
    .eq('user_id',uid).gte('punch_in',weekStart()+'T00:00:00'));
  toast('✓ Paiement enregistré — '+empName+' voit Payé ✓ de son côté');
}

// ════════════════════════════════════════════
// COMMISSIONS PERSO
// ════════════════════════════════════════════
async function loadPersonalComm(user){
  const el=document.getElementById('comm-perso-body');
  const t=document.getElementById('comm-perso-t');
  if(!el)return;
  if(t)t.textContent='Mes commissions — '+user.name;

  const uid=curUser?.db_id;
  const res=uid?await supa(()=>db.from('commissions')
    .select('*').eq('user_id',uid).eq('week_start',weekStart()).maybeSingle()):null;
  const c=res?.data;

  if(user.role==='tech'){
    const jobs=c?.jobs_count||8;
    const rev=c?.base_amount||c?.sales_amount||2840;
    const comm=c?.commission_amount||Math.round(rev*0.18);
    const paid=c?.status==='paid'||false;
    el.innerHTML=`<div class="comm-sec">
      <div style="display:flex;justify-content:space-between;margin-bottom:12px">
        <div><div style="font-size:14px;font-weight:800">${user.name}</div><div style="font-size:11px;color:var(--tx4)">Technicien fenêtres · 18% par job assigné</div></div>
        <div style="text-align:right"><div style="font-size:10px;color:var(--tx4);font-weight:600;text-transform:uppercase">Commission semaine</div><div style="font-size:22px;font-weight:800;color:var(--teal)">$${comm.toLocaleString()}</div></div>
      </div>
      <div class="g3">
        <div style="background:var(--s2);border-radius:var(--rm);padding:10px;border:0.5px solid var(--bd)"><div style="font-size:9px;color:var(--tx4);font-weight:600;text-transform:uppercase;margin-bottom:3px">Jobs</div><div style="font-size:17px;font-weight:800">${jobs}</div></div>
        <div style="background:var(--s2);border-radius:var(--rm);padding:10px;border:0.5px solid var(--bd)"><div style="font-size:9px;color:var(--tx4);font-weight:600;text-transform:uppercase;margin-bottom:3px">Revenus</div><div style="font-size:17px;font-weight:800;color:var(--teal)">$${rev.toLocaleString()}</div></div>
        <div style="background:var(--s2);border-radius:var(--rm);padding:10px;border:0.5px solid var(--bd)"><div style="font-size:9px;color:var(--tx4);font-weight:600;text-transform:uppercase;margin-bottom:3px">Statut</div><span class="badge ${paid?'bg':'ba'}" id="paye-status-personal">${paid?'Payé ✓':'En attente'}</span></div>
      </div>
    </div>`;
  } else {
    const ventes=c?.base_amount||c?.sales_amount||(user.role==='lead'?1820:2340);
    const comm=c?.commission_amount||(user.role==='lead'?419:304);
    const role_label=user.role==='lead'?'Lead · Pipeline+D2D+2% override':'Rep terrain D2D';
    el.innerHTML=commCard(user.name,role_label,ventes,comm,c?.status==='paid'||false);
  }
}
function buildPersonalComm(user){loadPersonalComm(user)}

function commCard(name,role,ventes,comm,paid=false){
  const pct=Math.min(Math.round((ventes/15000)*100),100);
  return`<div class="comm-sec">
    <div style="display:flex;justify-content:space-between;margin-bottom:12px">
      <div><div style="font-size:14px;font-weight:800">${name}</div><div style="font-size:11px;color:var(--tx4);margin-top:2px">${role}</div></div>
      <div style="text-align:right"><div style="font-size:10px;color:var(--tx4);font-weight:600;text-transform:uppercase">Commission semaine</div><div style="font-size:22px;font-weight:800;color:var(--teal)">$${(comm||0).toLocaleString()}</div></div>
    </div>
    <div class="g3">
      <div style="background:var(--s2);border-radius:var(--rm);padding:10px;border:0.5px solid var(--bd)"><div style="font-size:9px;color:var(--tx4);font-weight:600;text-transform:uppercase;margin-bottom:3px">Ventes</div><div style="font-size:16px;font-weight:800;color:var(--teal)">$${(ventes||0).toLocaleString()}</div></div>
      <div style="background:var(--s2);border-radius:var(--rm);padding:10px;border:0.5px solid var(--bd)"><div style="font-size:9px;color:var(--tx4);font-weight:600;text-transform:uppercase;margin-bottom:3px">Taux</div><div style="font-size:16px;font-weight:800">13%</div></div>
      <div style="background:var(--s2);border-radius:var(--rm);padding:10px;border:0.5px solid var(--bd)"><div style="font-size:9px;color:var(--tx4);font-weight:600;text-transform:uppercase;margin-bottom:3px">Statut</div><span class="badge ${paid?'bg':'ba'}" id="paye-status-personal">${paid?'Payé ✓':'En attente'}</span></div>
    </div>
    <div style="margin-top:10px">
      <div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:4px"><span style="color:var(--tx4);font-weight:600">Boni $15,000 → +$500</span><span style="font-weight:700">${pct}%</span></div>
      <div style="background:var(--s3);border-radius:3px;height:4px;overflow:hidden"><div style="height:100%;border-radius:3px;background:var(--teal);width:${pct}%"></div></div>
    </div>
  </div>`;
}

// ════════════════════════════════════════════
// MA PAYE (terrain perso)
// ════════════════════════════════════════════
async function loadPersonalPaye(user){
  const el=document.getElementById('paye-body');
  const t=document.getElementById('paye-t');
  if(!el)return;

  const uid2=curUser?.db_id;
  const res=uid2?await supa(()=>db.from('timesheets')
    .select('*').eq('user_id',uid2).gte('punch_in',weekStart()+'T00:00:00').order('punch_in')):null;
  let days,totalH,paid=false;
  if(res?.data&&res.data.length){
    days=res.data.map(r=>({
      j:fmtDate(r.punch_in),
      in:fmtTime(r.punch_in),out:fmtTime(r.punch_out),
      h:parseFloat(r.hours_worked||0),jobs:'',paid:r.paid,
    }));
    totalH=days.reduce((s,d)=>s+d.h,0);
    paid=res.data.some(r=>r.paid);
  } else {
    const fb=FB_GAZON_EMP.find(e=>e.name===user.name)||FB_GAZON_EMP[0];
    days=fb.days;totalH=days.reduce((s,d)=>s+d.h,0);
  }
  const paye=(totalH*20).toFixed(2);
  const ws=weekStart();
  const wsDate=new Date(ws);
  const wLabel=`Semaine du ${wsDate.getDate()} ${wsDate.toLocaleString('fr',{month:'long'})}`;
  if(t)t.textContent='Ma paye — '+user.name;

  el.innerHTML=`
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
      <div style="font-size:16px;font-weight:800">${wLabel}</div>
      <span class="badge ${paid?'bg':'ba'}" id="paye-status-personal" style="font-size:13px;padding:4px 12px">${paid?'Paiement reçu ✓':'En attente de paiement'}</span>
    </div>
    <div class="ts-row" style="font-size:9px;color:var(--tx4);font-weight:700;text-transform:uppercase;padding:5px 0"><span>Jour</span><span>Arrivée</span><span>Départ</span><span>Jobs</span><span style="text-align:right">Heures</span></div>
    ${days.map(d=>`<div class="ts-row">
      <span style="font-weight:600">${d.j}</span>
      <span style="color:var(--tx3)">${d.in||'—'}</span>
      <span style="color:var(--tx3)">${d.out||'—'}</span>
      <span class="tsm">${esc(d.jobs)}</span>
      <span style="font-weight:700;color:${(d.h||0)>0?'var(--ol)':'var(--tx4)'};text-align:right">${(d.h||0)>0?d.h+'h':'—'}</span>
    </div>`).join('')}
    <div class="ts-total">
      <div><div style="font-size:10px;color:var(--tx4);font-weight:700;text-transform:uppercase">Total heures</div><div style="font-size:22px;font-weight:800">${totalH.toFixed(1)}h</div></div>
      <div><div style="font-size:10px;color:var(--tx4);font-weight:700;text-transform:uppercase">Taux</div><div style="font-size:16px;font-weight:800;color:var(--td)">20$/h</div></div>
      <div style="text-align:right"><div style="font-size:10px;color:var(--tx4);font-weight:700;text-transform:uppercase">Paye brute</div><div style="font-size:22px;font-weight:800;color:var(--ol)">$${paye}</div></div>
    </div>`;
}
function buildPersonalPaye(user){loadPersonalPaye(user)}

// ════════════════════════════════════════════
// SOUMISSIONS
// ════════════════════════════════════════════
async function loadSousHist(user){
  const tEl=document.getElementById('sous-hist-t');
  const el=document.getElementById('sous-hist');
  if(!el)return;
  const isAdmin=user.role==='admin'||user.role==='lead';
  const q=db.from('quotes').select('*').order('created_at',{ascending:false}).limit(20);
  if(!isAdmin&&curUser?.db_id)q.eq('created_by',curUser.db_id);
  const res=await supa(()=>q);
  if(res?.data&&res.data.length){
    if(tEl)tEl.textContent=isAdmin?'Toutes les soumissions':'Mes soumissions récentes';
    if(isAdmin){
      el.innerHTML=`<div class="tr trh" style="grid-template-columns:1fr 50px 80px 60px 45px"><span>Client</span><span>Rep</span><span>Service</span><span>Prix</span><span>Statut</span></div>`
        +res.data.map(q=>{
          const st=q.status==='signed'?'bg':q.status==='sent'?'ba':'bx';
          const sl=q.status==='signed'?'Signé':q.status==='sent'?'Envoyé':'Brouillon';
          return`<div class="tr" style="grid-template-columns:1fr 50px 80px 60px 45px">
            <div><div class="tn">${esc(q.client_name||'')}</div><div class="tsm">${fmtRelDate(q.created_at)}</div></div>
            <span style="font-size:10px;font-weight:700;color:var(--td)">${esc(q.rep_name||USER_NAMES[q.created_by]||'')}</span>
            <span class="badge bt" style="font-size:9px">${esc(q.service_type||q.service||'')}</span>
            <span style="font-weight:700;color:var(--teal);font-size:11px">$${(q.price||q.amount||0).toLocaleString()}</span>
            <span class="badge ${st}">${sl}</span>
          </div>`;
        }).join('');
    } else {
      el.innerHTML=`<div class="tr trh" style="grid-template-columns:1fr 80px 60px 45px"><span>Client</span><span>Service</span><span>Prix</span><span>Statut</span></div>`
        +res.data.map(q=>{
          const st=q.status==='signed'?'bg':q.status==='sent'?'ba':'bx';
          const sl=q.status==='signed'?'Signé':q.status==='sent'?'Envoyé':'Brouillon';
          return`<div class="tr" style="grid-template-columns:1fr 80px 60px 45px">
            <div><div class="tn">${esc(q.client_name||'Client')}</div><div class="tsm">${fmtRelDate(q.created_at)}</div></div>
            <span class="badge bt" style="font-size:9px">${esc(q.service_type||q.service||'')}</span>
            <span style="font-weight:700;color:var(--teal);font-size:11px">$${(q.price||q.amount||0).toLocaleString()}</span>
            <span class="badge ${st}">${sl}</span>
          </div>`;
        }).join('');
    }
  } else {
    if(tEl)tEl.textContent=isAdmin?'Toutes les soumissions':'Mes soumissions récentes';
    if(isAdmin){
      el.innerHTML=`<div class="tr trh" style="grid-template-columns:1fr 50px 50px 60px 45px"><span>Client</span><span>Rep</span><span>Svc</span><span>Prix</span><span>Statut</span></div>
        ${[{n:'Gosselin',d:'13 avr',rep:'Will',rc:'td',s:'Int/Ext',p:420,st:'ba',sl:'Envoyé'},{n:'S. Bergeron',d:'13 avr',rep:'Nathan',rc:'ol',s:'Int/Ext',p:350,st:'ba',sl:'Envoyé'},{n:'P. Gagnon',d:'10 avr',rep:'Will',rc:'td',s:'Int/Ext',p:450,st:'bg',sl:'Signé'}].map(q=>`
        <div class="tr" style="grid-template-columns:1fr 50px 50px 60px 45px">
          <div><div class="tn">${q.n}</div><div class="tsm">${q.d}</div></div>
          <span style="font-size:10px;font-weight:700;color:var(--${q.rc})">${q.rep}</span>
          <span class="badge bt" style="font-size:9px">${q.s}</span>
          <span style="font-weight:700;color:var(--teal);font-size:11px">$${q.p}</span>
          <span class="badge ${q.st}">${q.sl}</span>
        </div>`).join('')}`;
    } else {
      el.innerHTML=`<div class="tr trh" style="grid-template-columns:1fr 70px 60px 45px"><span>Client</span><span>Service</span><span>Prix</span><span>Statut</span></div>
        <div class="tr" style="grid-template-columns:1fr 70px 60px 45px"><div><div class="tn">Famille Martin</div><div class="tsm">Auj.</div></div><span class="badge bt" style="font-size:9px">Ext.</span><span style="font-weight:700;color:var(--teal);font-size:11px">$220</span><span class="badge ba">Envoyé</span></div>
        <div class="tr" style="grid-template-columns:1fr 70px 60px 45px"><div><div class="tn">Famille Rousseau</div><div class="tsm">11 avr</div></div><span class="badge bt" style="font-size:9px">Int/Ext</span><span style="font-weight:700;color:var(--teal);font-size:11px">$420</span><span class="badge bg">Signé</span></div>`;
    }
  }
}
function buildSousHist(user){loadSousHist(user)}

function onSvcChange(){
  const v=document.getElementById('svc-sel').value;
  document.getElementById('plan-section').style.display=v.startsWith('v-')?'block':'none';
}
function selPlan(p){['1x','2x','3x'].forEach(k=>{const el=document.getElementById('plan-'+k);if(el){el.style.borderColor=k===p?'var(--teal)':'var(--bd2)';el.style.background=k===p?'rgba(105,201,202,.06)':'var(--s2)'}});}

async function subSous(type){
  const ok=document.getElementById('sous-ok');
  const clientSel=document.querySelector('#pg-soumissions select');
  const svcSel=document.getElementById('svc-sel');
  const priceInp=document.querySelector('#pg-soumissions input[type="number"]');
  const notesTA=document.querySelector('#pg-soumissions textarea');
  const plan=['1x','2x','3x'].find(k=>{const el=document.getElementById('plan-'+k);return el&&el.style.borderColor==='var(--teal)'});
  const clientName=clientSel?.value&&clientSel.value!=='— Sélectionner —'?clientSel.value:'';
  const svcType=svcSel?.options[svcSel.selectedIndex]?.text||'';
  const price=parseFloat(priceInp?.value)||0;
  const notes=notesTA?.value||'';
  const status=type==='devis'?'sent':'signed';
  await supa(()=>db.from('quotes').insert({
    service:svcType,plan_type:plan||null,amount:price,notes,status,
    service_category:type,created_by:curUser?.db_id||null,
    created_at:new Date().toISOString(),
  }));
  ok.textContent=type==='devis'?'✓ Devis créé dans QuickBooks!':'✓ Facture créée dans QuickBooks!';
  ok.style.display='block';
  setTimeout(()=>{ok.style.display='none';if(curUser)loadSousHist(curUser)},2500);
}

// ════════════════════════════════════════════
// CLOCK IN / OUT
// ════════════════════════════════════════════
async function loadClockStatus(user){
  if(user.role!=='terrain'&&!(user.role==='rep'&&user.secondary==='terrain'))return;
  const today=new Date().toISOString().slice(0,10);
  const uid3=curUser?.db_id;
  const res=uid3?await supa(()=>db.from('timesheets')
    .select('*').eq('user_id',uid3).gte('punch_in',today+'T00:00:00').lt('punch_in',today+'T23:59:59').maybeSingle()):null;
  const s=document.getElementById('clock-status');if(!s)return;
  if(res?.data){
    const row=res.data;
    curClockId=row.id;
    if(row.punch_in&&!row.punch_out){
      clockedIn=true;clockInTime=new Date(row.punch_in);
      s.textContent='Arrivée pointée à '+fmtTime(row.punch_in);s.style.color='var(--green)';
    } else if(row.punch_in&&row.punch_out){
      s.textContent='Journée terminée — '+fmtTime(row.punch_in)+' → '+fmtTime(row.punch_out)+' ('+row.hours_worked+'h)';
      s.style.color='var(--tx4)';clockedIn=false;
    }
  }
}

async function doPunch(type){
  const now=new Date();
  const t=fmtTime(now.toISOString());
  const s=document.getElementById('clock-status');
  if(type==='in'){
    if(clockedIn){s.textContent='Déjà pointé à '+fmtTime(clockInTime?.toISOString());return}
    clockedIn=true;clockInTime=now;
    s.textContent='Arrivée pointée à '+t;s.style.color='var(--green)';
    const res=await supa(()=>db.from('timesheets').insert({
      user_id:curUser.db_id,
      punch_in:now.toISOString(),week_start:weekStart(),paid:false,
    }).select().single());
    if(res?.data)curClockId=res.data.id;
    toast('✓ Clock in enregistré à '+t);
  } else {
    if(!clockedIn){s.textContent='Tu n\'as pas encore pointé.';s.style.color='var(--amber)';return}
    const diff=Math.round((now-clockInTime)/60000);
    const h=parseFloat((diff/60).toFixed(2));
    const hDisp=Math.floor(h)+'h'+(diff%60>0?(diff%60)+'min':'');
    s.textContent='Départ à '+t+' · '+hDisp+' travaillé';s.style.color='var(--tx4)';clockedIn=false;
    if(curClockId){
      await supa(()=>db.from('timesheets').update({punch_out:now.toISOString(),hours_worked:h}).eq('id',curClockId));
    }
    toast('✓ Clock out — '+hDisp+' enregistré');
    if(curUser)loadPersonalPaye(curUser);
  }
}

function startClock(){
  function tick(){
    const now=new Date();
    const t=now.getHours().toString().padStart(2,'0')+':'+now.getMinutes().toString().padStart(2,'0');
    const el=document.getElementById('clock-big');if(el)el.textContent=t;
    const de=document.getElementById('clock-date-big');if(de)de.textContent=getDate();
  }
  tick();setInterval(tick,30000);
}

// ════════════════════════════════════════════
// NOUVEAU LEAD
// ════════════════════════════════════════════
async function confirmNL(){
  const modal=document.getElementById('nl-modal');
  const inputs=modal.querySelectorAll('input');
  const srcSel=modal.querySelectorAll('select')[0];
  const svcSel=modal.querySelectorAll('select')[1];
  const name=inputs[0]?.value.trim();
  const phone=inputs[1]?.value.trim();
  const source=srcSel?.value||'';
  const service=svcSel?.value||'';
  if(!name){toast('Nom requis',true);return}
  const res=await supa(()=>db.from('leads').insert({
    full_name:name,phone,source,service_interest:service,pipeline_stage:'new',
    owner_id:curUser?.db_id||null,
    created_at:new Date().toISOString(),
  }).select().single());
  document.getElementById('nl-ok').style.display='block';
  if(res?.data){
    toast('✓ Lead ajouté — SMS automatique envoyé');
    inputs.forEach(i=>i.value='');
  }
  setTimeout(()=>{
    document.getElementById('nl-ok').style.display='none';
    modal.classList.remove('show');
    loadPipeMW();
    if(curUser)loadPersoPipe(curUser);
  },1800);
}

// ════════════════════════════════════════════
// REALTIME — sync entre admin et employés
// ════════════════════════════════════════════
function setupRealtime(user){
  try{
    const ch=db.channel('crm-live')
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'commissions'},(payload)=>{
        const c=payload.new;
        if(c.status==='paid'||c.paid){
          if(c.user_id===curUser?.db_id||c.username===user.username){
            const ps=document.getElementById('paye-status-personal');
            if(ps){ps.className='badge bg';ps.style.fontSize='13px';ps.style.padding='4px 12px';ps.textContent='Paiement reçu ✓'}
            toast('✓ Ton paiement a été enregistré!');
          }
          if(user.role==='admin')loadAdminComm();
        }
      })
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'timesheets'},(payload)=>{
        const r=payload.new;
        if(r.paid&&r.user_id===curUser?.db_id){
          const ps=document.getElementById('paye-status-personal');
          if(ps){ps.className='badge bg';ps.style.fontSize='13px';ps.style.padding='4px 12px';ps.textContent='Paiement reçu ✓'}
          toast('✓ Ta paye a été envoyée!');
        }
        if(user.role==='admin')loadGazonList();
      })
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'sms_messages'},(payload)=>{
        const m=payload.new;
        if(m.direction==='in'&&curLead&&m.lead_id===curLead._id){
          const el=document.getElementById('sms-thread');
          if(el){
            el.innerHTML+=`<div class="sms-msg in"><div class="sms-bubble in">${esc(m.message)}</div><div class="sms-time">${fmtTime(m.created_at)}</div></div>`;
            el.scrollTop=el.scrollHeight;
          }
        }
      })
      .on('postgres_changes',{event:'INSERT',schema:'public',table:'leads'},(payload)=>{
        if(user.role==='admin'||user.role==='lead')loadPipeMW();
      })
      .subscribe();
    window._rt=ch;
  }catch(e){console.warn('Realtime non disponible:',e)}
}

// ════════════════════════════════════════════
// TITRES
// ════════════════════════════════════════════
function customizeTitles(user){
  const gr=getGreeting();
  ['ph-g','tg'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=gr});
  ['ph-t','tn'].forEach(id=>{const el=document.getElementById(id);if(el)el.textContent=user.name});
  const st=document.getElementById('sous-t');if(st&&(user.role==='rep'||user.role==='tech'))st.textContent='Mes soumissions — '+user.name;
  const spt=document.getElementById('spotio-t');if(spt&&(user.role==='rep'||user.role==='tech'))spt.textContent='Carte D2D — '+user.name;
  const ppt=document.getElementById('perso-pipe-t');if(ppt)ppt.textContent=user.role==='tech'?'Mes rappels — '+user.name:'Mon pipeline D2D — '+user.name;
}

// ════════════════════════════════════════════
// RECHERCHE CLIENTS
// ════════════════════════════════════════════
function searchClients(q){renderClientsList(q)}

// ════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════
buildDemoGrid();
document.getElementById('splash').style.display='none';
