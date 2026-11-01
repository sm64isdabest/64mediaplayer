# 64 Media Player

Catálogo web da biblioteca MP3, hospedado no GitHub Pages. O site lista os metadados; os arquivos de áudio são assets de uma GitHub Release pública e são carregados pela internet. Esta etapa ainda não inclui controles de reprodução.

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

Para executar a interface localmente, use um servidor HTTP (o service worker não funciona ao abrir o arquivo diretamente):

```powershell
py -m http.server 8000
```

Abra <http://localhost:8000>.
