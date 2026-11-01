# 64 Media Player

Player web pessoal, estático e sem build. Nesta etapa, a biblioteca aceita MP3 e guarda os arquivos no IndexedDB do navegador. Nenhum áudio é enviado para o servidor.

## Teste local

Use um servidor local (Service Worker não funciona abrindo `index.html` diretamente):

```powershell
py -m http.server 8000
```

Abra `http://localhost:8000`. Escolha vários MP3 ou uma pasta; se o navegador não retornar o caminho, informe o nome da coleção. Importe cerca de 20 faixas, recarregue e confira a lista, o contador e o armazenamento. Cancele um lote e selecione os mesmos arquivos para confirmar que as faixas salvas são puladas.

## Teste no Meta Quest 3S

Publique em HTTPS, abra o site no navegador do Quest e importe cerca de 20 MP3. Se o seletor de pasta não aparecer, use seleção múltipla e nomeie a coleção. Recarregue a página e confirme que a lista e o medidor permanecem. Para teste offline, abra o site uma vez conectado, aguarde o carregamento e então desligue a rede e recarregue.

O Quest controla quais seletores de arquivo oferece. `navigator.storage.estimate()` é uma estimativa; persistência pode ser recusada e codecs serão confirmados na etapa de reprodução.

## Publicação estática

- **GitHub Pages:** envie estes arquivos para a branch e pasta publicadas; em *Settings → Pages*, escolha a fonte. Aguarde o endereço HTTPS e abra-o no Quest.
- **Cloudflare Pages:** crie um projeto Pages conectado ao repositório, deixe o comando de build vazio e use `/` como diretório de saída.

Não publique a pasta pessoal de músicas. Os MP3 são escolhidos pelo usuário e permanecem no armazenamento do navegador.
