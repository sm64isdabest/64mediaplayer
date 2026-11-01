# 64 Media Player

Player web da biblioteca MP3, hospedado no GitHub Pages. Os arquivos de áudio são assets de uma GitHub Release pública e são carregados pela internet.

## Endereços públicos

- Site (depois de habilitar GitHub Pages para a branch `main`, pasta `/`): <https://sm64isdabest.github.io/64mediaplayer/>
- Release de áudio: <https://github.com/sm64isdabest/64mediaplayer/releases/tag/music-library>

Os assets da Release e o catálogo podem ser acessados por qualquer pessoa, sem login. Qualquer pessoa também pode copiar ou baixar os MP3. Use esta publicação somente para músicas que você tem autorização para distribuir publicamente.

## Atualizar a biblioteca

Os 673 MP3 ficam na pasta local `music/`, que não é adicionada ao Git. O publicador transmite os arquivos diretamente para a Release; não faz uma cópia temporária de todos os áudios.

Requisitos: Node.js 22 ou posterior, GitHub CLI (`gh`) e autenticação com permissão de escrita neste repositório.

```powershell
gh auth login
node scripts/publish-music.mjs --dry-run
node scripts/publish-music.mjs --publish
git add -- music-catalog.json
git commit -m "chore: update public music catalog"
git push origin main
```

O envio pode ser repetido: arquivos iguais são pulados; arquivos alterados são enviados novamente. O catálogo só é substituído depois de comparar a lista da Release com os caminhos, tamanhos e hashes locais. Não faça `git add music/`; mantenha os MP3 fora do histórico do repositório.

## Publicação no GitHub Pages

No GitHub, abra **Settings → Pages**, escolha **Deploy from a branch**, selecione `main` e a pasta `/ (root)`. O endereço esperado é o link acima. O site e o catálogo ficam disponíveis pelo Pages; as faixas continuam fora do pacote do Pages, nos assets da Release.

## Privacidade e conexão

O nome das faixas, tags ID3, pastas e links dos MP3 aparecem no catálogo público. Não inclua informação privada nos nomes ou metadados. Para carregar a lista pela primeira vez é necessário internet. O service worker pode manter a interface e o catálogo em cache para consulta offline depois de uma visita conectada; os MP3 não entram no cache e exigem internet.

Na verificação de um asset publicado, o servidor respondeu `206 Partial Content` com `Accept-Ranges: bytes`, mas usou `application/octet-stream` e não enviou cabeçalho CORS. A reprodução direta em segundo plano foi confirmada no Quest. Web Audio (EQ e crossfade) requer CORS e permanece adiado para esses links.

Os controles usam o áudio nativo do navegador: play/pause, próxima/anterior, seek, volume, repetição, shuffle por ciclo, escopo por pasta, busca por título/artista/álbum/pasta, favoritos, histórico e fila editável.

Favoritos e as últimas 100 reproduções ficam em `localStorage` somente neste navegador e são associados aos IDs do catálogo; nenhum MP3 é guardado ali. O histórico pode ser limpo pela interface. A fila permite itens repetidos, é mantida apenas durante a sessão e toca antes da ordem normal. Busca e filtro de favoritos limitam a lista mostrada; a reprodução automática continua seguindo o escopo de pastas selecionado.

Crossfade e EQ continuam adiados: o endpoint atual não fornece CORS para o Web Audio. Para recuperar a interface offline após as mudanças, o service worker instala o cache `64-media-player-shell-v5`; os MP3 continuam fora do cache e exigem internet.

Para executar a interface localmente, use um servidor HTTP (o service worker não funciona ao abrir o arquivo diretamente):

```powershell
py -m http.server 8000
```

Abra <http://localhost:8000>.
