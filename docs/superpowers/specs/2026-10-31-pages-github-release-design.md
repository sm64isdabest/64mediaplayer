# Player no GitHub Pages com MP3 em GitHub Release

## Intenção

Publicar o player em GitHub Pages e tocar a biblioteca de aproximadamente 700 MP3 diretamente de assets públicos de um GitHub Release. Isso evita copiar cerca de 2,4 GiB para IndexedDB e mantém o uso da biblioteca fora do limite de 1 GiB do site publicado pelo Pages.

## Objetivos

- Manter o site estático em GitHub Pages, sem servidor próprio ou build obrigatório.
- Manter os MP3 da pasta local `music/` fora do histórico Git normal e do pacote publicado pelo Pages.
- Publicar os MP3 como assets de um Release público e gerar um catálogo compacto com metadados e URL de cada faixa.
- Tocar faixas por streaming sob demanda; não copiar a biblioteca inteira para armazenamento do navegador.
- Continuar compatível com lista virtualizada de 600+ faixas e a interface acessível no Quest.
- Preservar as etapas combinadas: primeiro validar catálogo/site no Quest; depois adicionar reprodução e controles em etapas confirmadas pelo usuário.
- Usar credenciais somente localmente durante a publicação; nunca embutir token no site ou nos arquivos versionados.

## Fora do escopo desta revisão

- Disponibilizar áudio offline ou fazer cache de todos os MP3 no Quest.
- Incluir os MP3 no Git normal, no pacote do GitHub Pages ou em um bucket Cloudflare.
- Publicar automaticamente a cada alteração no código sem ação explícita de lançamento da biblioteca.
- Prometer suporte a EQ, crossfade ou análise Web Audio antes de confirmar cabeçalhos CORS nos downloads de Release e testar no Quest.

## Abordagens

1. **GitHub Pages + GitHub Release (escolhida):** o Pages serve o player e um catálogo pequeno; um Release público no mesmo repositório mantém os MP3 como anexos binários, separados do histórico Git e do pacote Pages. A biblioteca local tem 700 arquivos, abaixo do limite documentado de 1.000 assets por Release; o maior MP3 observado tem aproximadamente 18 MB, abaixo do limite individual de 2 GiB. Trade-off: os áudios são públicos, precisam de internet e o GitHub pode limitar tráfego considerado excessivo.
2. **GitHub Pages + Cloudflare R2:** mantém o mesmo catálogo/streaming, com franquia gratuita de armazenamento e saída sem tarifa; exige outra conta e configuração do endpoint público, e o endereço `r2.dev` é limitado para desenvolvimento.
3. **Servidor no celular ou computador:** não exige armazenamento na nuvem, mas o dispositivo precisa permanecer ligado e acessível na rede. O uso de conteúdo HTTP pela página HTTPS e a disponibilidade na rede do Quest adicionam configuração.

O usuário escolheu Pages + GitHub Release, aceita que as músicas sejam públicas e escolheu streaming online. O repositório já está público. A pasta `music/` fica como origem local dos arquivos; ela não será adicionada ao Git.

## Desenho

- GitHub Pages continua servindo `index.html`, CSS, JavaScript, service worker, assets visuais e um `music-catalog.json` pequeno.
- Um Release público separado contém os arquivos MP3. Um processo local de publicação percorre `music/`, valida contagem/tamanho, cria nomes de asset estáveis e únicos, envia os MP3 por meio de credenciais locais do GitHub CLI/API e grava `music-catalog.json`. O catálogo só será commitado/enviado ao Pages depois de todos os assets necessários terem sido validados. O token nunca aparece no frontend.
- Cada entrada do catálogo contém um ID estável, nome/título, artista/álbum quando tags válidas forem lidas, pasta relativa, tamanho, duração se disponível, tipo de mídia e `browser_download_url` do asset correspondente. Capas embutidas em ID3 não serão copiadas para o catálogo nesta revisão; o app usa arte genérica até decisão posterior.
- O player carrega o catálogo no início e solicita o MP3 somente quando uma faixa for escolhida. O service worker não armazena respostas de áudio. A interface identifica a biblioteca como online e apresenta falhas de rede sem apagar o catálogo.
- Os MP3 nunca são passados a `git add`; o `.gitignore` protege `music/` e os arquivos temporários da publicação. Commit e push do código continuam pequenos.
- O formato de asset evita colisões de nomes repetidos em álbuns diferentes, preservando o caminho e nome originais no catálogo.
- A publicação usa a tag estável `music-library` e nomes de asset determinísticos. É reproduzível e retomável: validar antes de enviar, comparar assets já existentes, pular uploads idênticos, produzir relatório agregado e falhar antes de publicar catálogo incompleto. Atualizar assets substitui nomes idênticos dessa Release; o catálogo versionado no Pages só muda depois do upload completo.
- URLs de Release são de outra origem que o GitHub Pages. Áudio HTML básico deve ser validado; recursos que usam Web Audio precisam de CORS. Se CORS não estiver disponível no endpoint real, a fase de EQ/crossfade deverá ser reavaliada com um endpoint que permita CORS antes de ser implementada.
- Dados antigos do IndexedDB não são apagados automaticamente durante a troca de fonte. A página passa a usar o catálogo remoto como fonte principal.

## Critérios de sucesso

- O Release contém todos os MP3 esperados sem o conteúdo aparecer no histórico regular do repositório ou no pacote Pages.
- O catálogo publicado tem exatamente uma entrada para cada asset, sem colisões, vazios ou caminhos quebrados.
- O Pages lista a coleção usando o catálogo, mesmo que uma faixa falhe ao carregar; falhas mostram mensagem e podem ser tentadas novamente.
- Ao selecionar uma faixa, o navegador solicita o asset correspondente e não grava o MP3 em IndexedDB nem no cache do service worker.
- O app informa que reprodução requer conexão. A interface e o shell continuam abrindo offline, mas o usuário não é levado a esperar áudio offline.
- O teste no Quest confirma acesso ao Pages e reprodução de uma pequena amostra antes de avançar para controles/player completos.
- CORS para `AudioContext.createMediaElementSource()` é verificado contra um asset real. EQ/crossfade só seguem se CORS funcionar ou se uma arquitetura de entrega com CORS for aprovada.

## Decisões deixadas ao implementador

- Preferir a ferramenta oficial `gh` para criação e upload de assets e usar uma credencial já autenticada localmente.
- Usar a tag de Release `music-library` e nomes de asset derivados de ID estável, não apenas nome de arquivo.
- Gerar `music-catalog.json` localmente depois de validar os assets e commitá-lo somente após o upload completo.
- Manter no catálogo metadados de tags reconhecidas e recorrer ao nome do arquivo quando faltarem.
- Nunca limpar dados locais legados sem consentimento explícito.

## Referências

- [GitHub Releases: limite de 1.000 assets, 2 GiB por arquivo e distribuição de binários](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases).
- [Limites do GitHub Pages: site publicado máximo de 1 GiB](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits).
- [CORS de media e atributo `crossorigin`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/audio).
- [Web Audio API: uso de `AudioContext.createMediaElementSource()`](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Using_Web_Audio_API).
