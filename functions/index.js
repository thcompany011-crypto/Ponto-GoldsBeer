const { onSchedule } = require('firebase-functions/v2/scheduler');
const { setGlobalOptions, logger } = require('firebase-functions');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getMessaging } = require('firebase-admin/messaging');

initializeApp();
setGlobalOptions({ region: 'southamerica-east1', maxInstances: 1 });

const db = getFirestore();
const messaging = getMessaging();
const TIME_ZONE = 'America/Sao_Paulo';
const MINUTOS_ANTECEDENCIA = 15;
const MINUTOS_SEM_ENTRADA = 10;
const MINUTOS_SEM_SAIDA = 15;

function partesDataBrasil(date) {
    const partes = new Intl.DateTimeFormat('en-CA', {
        timeZone: TIME_ZONE,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(date);
    const p = Object.fromEntries(partes.map(x => [x.type, x.value]));
    return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour), minute: Number(p.minute), second: Number(p.second) };
}

function chaveData({ year, month, day }) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function dataHoraAlvo(date, hhmm, deslocamentoDias = 0) {
    const p = partesDataBrasil(date);
    const [hora, minuto] = hhmm.split(':').map(Number);
    return new Date(Date.UTC(p.year, p.month - 1, p.day + deslocamentoDias, hora, minuto, 0) + 3 * 60 * 60 * 1000);
}

function adicionarMinutos(date, minutos) {
    return new Date(date.getTime() + minutos * 60000);
}

async function temBatida(uid, tipo, inicio, fim) {
    const snap = await db.collection('batidas').where('uid', '==', uid).get();
    return snap.docs.some((doc) => {
        const d = doc.data();
        if (d.tipo !== tipo || !d.data) return false;
        const instante = new Date(d.data);
        return instante >= inicio && instante < fim;
    });
}

async function enviarParaUsuario(uid, titulo, corpo, tag, chave) {
    const tokensSnap = await db.collection('usuarios').doc(uid).collection('pushTokens').get();
    if (tokensSnap.empty) return;

    const marker = db.collection('notificacoesJornada').doc(chave);
    if ((await marker.get()).exists) return;

    const tokens = tokensSnap.docs.map((doc) => ({ id: doc.id, token: doc.data().token })).filter(x => x.token);
    if (!tokens.length) return;

    const resultados = await Promise.all(tokens.map(async ({ id, token }) => {
        try {
            return await messaging.send({
                token,
                data: { title: titulo, body: corpo, tag, url: './dashboard.html' },
                webpush: { headers: { Urgency: 'high' } }
            });
        } catch (error) {
            const codigo = error?.code || '';
            if (codigo.includes('registration-token-not-registered') || codigo.includes('invalid-registration-token')) {
                await db.collection('usuarios').doc(uid).collection('pushTokens').doc(id).delete().catch(() => {});
            }
            return null;
        }
    }));

    if (resultados.some(Boolean)) await marker.set({ uid, criadoEm: new Date().toISOString(), titulo, tag });
}

async function processarUsuario(uid, perfil, agora) {
    const jornadas = Array.isArray(perfil.jornadaSemanal) ? perfil.jornadaSemanal : null;
    const horarios = Array.isArray(perfil.horariosSemanais) ? perfil.horariosSemanais : null;
    if (!jornadas || jornadas.length !== 7 || !horarios || horarios.length !== 7) return;

    const diaSemana = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short' }).format(agora);
    const mapaDias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
    const indiceHoje = mapaDias[diaSemana];
    const horario = horarios[indiceHoje] || {};
    if (!horario.entrada && !horario.saida) return;

    const atual = partesDataBrasil(agora);
    const dataHoje = chaveData(atual);
    let entrada = horario.entrada ? dataHoraAlvo(agora, horario.entrada) : null;
    let saida = horario.saida ? dataHoraAlvo(agora, horario.saida) : null;
    if (entrada && saida && saida <= entrada) saida = dataHoraAlvo(agora, horario.saida, 1);

    if (entrada) {
        const aviso = adicionarMinutos(entrada, -MINUTOS_ANTECEDENCIA);
        if (Math.abs(agora - aviso) < 60000) {
            await enviarParaUsuario(uid, "🔔 Gold's Beer", `Sua jornada começa em ${MINUTOS_ANTECEDENCIA} minutos. Entrada programada: ${horario.entrada}.`, 'jornada-antecedencia', `${uid}_${dataHoje}_entrada_antecedencia`);
        }
        if (Math.abs(agora - entrada) < 60000) {
            await enviarParaUsuario(uid, "🟢 Gold's Beer", `Hora de registrar sua entrada. Entrada programada: ${horario.entrada}.`, 'jornada-entrada', `${uid}_${dataHoje}_entrada`);
        }
        const alerta = adicionarMinutos(entrada, MINUTOS_SEM_ENTRADA);
        if (Math.abs(agora - alerta) < 60000) {
            const possui = await temBatida(uid, 'Entrada', adicionarMinutos(entrada, -2), adicionarMinutos(entrada, MINUTOS_SEM_ENTRADA + 2));
            if (!possui) await enviarParaUsuario(uid, "⚠️ Gold's Beer", `Você ainda não registrou sua entrada. Sua jornada começou às ${horario.entrada}.`, 'jornada-sem-entrada', `${uid}_${dataHoje}_sem_entrada`);
        }
    }

    if (saida) {
        const dataEvento = chaveData(partesDataBrasil(saida));
        if (Math.abs(agora - saida) < 60000) {
            await enviarParaUsuario(uid, "🟠 Gold's Beer", `Hora de registrar sua saída. Saída programada: ${horario.saida}.`, 'jornada-saida', `${uid}_${dataEvento}_saida`);
        }
        const alerta = adicionarMinutos(saida, MINUTOS_SEM_SAIDA);
        if (Math.abs(agora - alerta) < 60000) {
            const possui = await temBatida(uid, 'Saída', adicionarMinutos(saida, -12 * 60), adicionarMinutos(saida, MINUTOS_SEM_SAIDA + 2));
            if (!possui) await enviarParaUsuario(uid, "⚠️ Gold's Beer", `Sua jornada terminou às ${horario.saida} e ainda não há registro de saída.`, 'jornada-sem-saida', `${uid}_${dataEvento}_sem_saida`);
        }
    }
}

exports.verificarJornadasENotificar = onSchedule({ schedule: 'every 1 minutes', timeZone: TIME_ZONE }, async () => {
    const agora = new Date();
    const usuarios = await db.collection('usuarios').where('ativo', '==', true).get();
    await Promise.all(usuarios.docs.map((doc) => processarUsuario(doc.id, doc.data(), agora)));
    logger.info('Verificação de jornadas concluída', { usuarios: usuarios.size });
});
