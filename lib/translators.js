const wait = (seconds) => new Promise(resolve => setTimeout(resolve, seconds * 1000))

module.exports = {

  libretranslate: {
    translate: async (data, language, apiKey = null, delay = 3) => {
      try {
        const res = await fetch("https://libretranslate.com/translate", {
          method: 'POST',
          body: JSON.stringify({
            q: data,
            source: 'auto',
            target: language || 'en',
            api_key: apiKey
          }),
          headers: { "Content-Type": "application/json" }
        })

        if (delay) await wait(delay)

        return await res.json()
      }
      catch(err) { return { error} }
    }
  },
  
  google: {
    translate: async (data, language, apiKey) => {
      if (!apiKey) throw new Error('API key missing')
      const apiUrl = 'https://translation.googleapis.com/language/translate/v2'
        const params = new URLSearchParams()
      params.append('q', data)
      params.append('target', language)
      params.append('key', apiKey)

      const translationUrl = `${apiUrl}?${params.toString()}`

      try {
        const response = await fetch(translationUrl, { method: 'POST' })
        const json = await response.json()
        return { 
          error: json.error, 
          data: json.data.translations[0].translatedText,
          sourceLanguage: json.data.translations[0].detectedSourceLanguage
        }
      } 
      catch (error) { return { error} }
    }
  },

  microsoft: {
    translate: async (data, language, apiKey, delay) => {
      if (!apiKey) throw new Error('API key missing')
      const apiUrl = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${language}`
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Ocp-Apim-Subscription-Key': apiKey,
            'Ocp-Apim-Subscription-Region': 'global',
          },
          body: JSON.stringify([{ Text: data }]),
        })

        if (delay) await wait(delay)

        const json = await response.json()
        return { 
          error: json.error, 
          data: json[0].translations[0].text
        }
      } 
      catch (error) { return { error} }
    }
  },

  yandex: {
    translate: async (data, language, apiKey) => {
      const apiUrl = `https://translate.yandex.net/api/v1.5/tr.json/translate?key=${apiKey}&text=${encodeURIComponent(data)}&lang=zh-en`
      try {
        const response = await fetch(apiUrl)
        const json = await response.json()

        if (json.code === 200) return { error: json.error, data: json.text[0] }
        else return { error: json.message }
      } catch (error) { return { error} }
    }
  },
}

