import axios from 'axios'
import FormData from 'form-data'

const UA =
  'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36'

function formatBytes(bytes) {
  if (!bytes) return '0 B'
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(2)} ${sizes[i]}`
}

function guessExtFromMime(mime = '') {
  const m = String(mime).toLowerCase()
  if (m.includes('pdf')) return 'pdf'
  if (m.includes('zip')) return 'zip'
  if (m.includes('json')) return 'json'
  if (m.includes('plain')) return 'txt'
  if (m.includes('jpeg')) return 'jpg'
  if (m.includes('png')) return 'png'
  if (m.includes('webp')) return 'webp'
  if (m.includes('mp4')) return 'mp4'
  if (m.includes('mpeg') || m.includes('mp3')) return 'mp3'
  if (m.includes('ogg')) return 'ogg'
  if (m.includes('gif')) return 'gif'
  return ''
}

function generateId(len = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let out = ''
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)]
  return out
}

function generateUniqueFilename(mime = '') {
  const ext = guessExtFromMime(mime) || (String(mime).split('/')[1] || 'bin')
  return `${generateId(8)}.${ext}`
}

async function uploadToCatbox(buffer, mime) {
  const form = new FormData()
  form.append('reqtype', 'fileupload')
  form.append('fileToUpload', buffer, { filename: generateUniqueFilename(mime) })

  const res = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity
  })

  const data = typeof res.data === 'string' ? res.data.trim() : ''
  if (!data.startsWith('https://')) throw new Error('Respuesta inválida de Catbox')
  return data
}

function extractUrlLoose(text = '') {
  const m = String(text || '').match(/https?:\/\/[^\s"'<>]+/g)
  return m?.[0] || null
}

async function uploadToAdoFiles(buffer, filename, apiKey) {
  const endpoint = 'https://adofiles.i11.eu/api/upload'
  const payload = {
    filename,
    content: Buffer.from(buffer).toString('base64'),
    apiKey
  }

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      'X-Api-Key': apiKey
    },
    body: JSON.stringify(payload)
  })

  const text = await res.text().catch(() => '')
  if (!res.ok) throw new Error(`AdoFiles HTTP ${res.status}: ${String(text).slice(0, 300)}`)

  let j = null
  try {
    j = JSON.parse(text)
  } catch {
    j = null
  }

  const file0 = Array.isArray(j?.files) ? j.files[0] : null
  let maybe =
    file0?.publicUrl ||
    file0?.url ||
    j?.publicUrl ||
    j?.url ||
    j?.data?.publicUrl ||
    j?.data?.url ||
    null

  if (maybe) {
    maybe = String(maybe)
    if (maybe.startsWith('http')) return maybe
    const loose = extractUrlLoose(maybe)
    if (loose) return loose
    if (maybe.startsWith('/')) return `https://adofiles.i11.eu${maybe}`
  }

  const loose = extractUrlLoose(text)
  if (loose) return loose

  throw new Error(`AdoFiles respondió sin link: ${String(text).slice(0, 300)}`)
}

export default {
  command: ['tourl'],
  category: 'utils',
  run: async (client, m, args, usedprefix, command, text) => {
    const q = m.quoted || m
    const mime = (q.msg || q).mimetype || ''

    if (!mime) {
      return client.reply(
        m.chat,
        `《✧》 Por favor, responde a una imagen/video/archivo con el comando *${usedprefix + command}* para convertirlo en URL.`,
        m
      )
    }

    try {
      const media = await q.download()
      const userName = global.db?.data?.users?.[m.sender]?.name || 'Usuario'
      const apiKey = 'Ado&'
      const filename = generateUniqueFilename(mime)

      const [catboxRes, adoRes] = await Promise.allSettled([
        uploadToCatbox(media, mime),
        uploadToAdoFiles(media, filename, apiKey)
      ])

      const catboxLink = catboxRes.status === 'fulfilled' ? catboxRes.value : null
      const adoLink = adoRes.status === 'fulfilled' ? adoRes.value : null

      if (!catboxLink && !adoLink) {
        const errA = adoRes.status === 'rejected' ? adoRes.reason?.message || String(adoRes.reason) : ''
        const errC = catboxRes.status === 'rejected' ? catboxRes.reason?.message || String(catboxRes.reason) : ''
        return m.reply(`《✧》 Fail\n\n• Catbox: ${errC || 'Error'}\n• AdoFiles: ${errA || 'Error'}`)
      }

      let msg = `✎ *Upload Success*\n\n`
      if (catboxLink) msg += `ׅ✿ *Catbox ›* ${catboxLink}\n`
      if (adoLink) msg += `ׅ✿ *AdoFiles ›* ${adoLink}\n`
      msg += `ׅ✿ *Peso ›* ${formatBytes(media.length)}\n`
      msg += `ׅ✿ *Solicitado por ›* ${userName}\n\n${typeof dev !== 'undefined' ? dev : ''}`

      await client.reply(m.chat, msg, m)
    } catch (e) {
      await m.reply(`《✧》 Fail\n> ${String(e?.message || e)}`)
    }
  }
}