# Player pessoal para Quest — design da etapa 1

## Intenção

Construir a primeira etapa de um media player web pessoal para catalogar cerca de 600 arquivos MP3 que o usuário transferiu para o Meta Quest 3S. Para evitar copiar aproximadamente 2,4 GiB para a cota do site, a opção principal é ler os arquivos da pasta selecionada no Quest e guardar no IndexedDB apenas metadados e referências a arquivos. O primeiro teste será com aproximadamente 20 faixas no headset.

## Objetivos

- Importar arquivos MP3 em lotes por seleção múltipla ou seleção de pasta quando o navegador oferecer `webkitdirectory`.
- Recuperar caminhos de pasta via `webkitRelativePath`; quando indisponíveis, perguntar o nome da coleção do lote.
- Ler título, artista, álbum, duração e capa quando as tags forem reconhecidas; usar o nome do arquivo como título alternativo.
- Preferir acesso direto à pasta local via File System Access API, guardando handles no IndexedDB e sem duplicar blobs de áudio.
- Manter importação por `<input type="file">` como alternativa compatível, guardando blobs no IndexedDB somente quando a API direta não estiver disponível ou o usuário optar por isso.
- Mostrar progresso, permitir cancelar a importação e retomar selecionando os mesmos arquivos, ignorando duplicatas detectadas por nome + tamanho.
- Listar metadados sem carregar todos os blobs e exibir as pastas da biblioteca.
- Exibir estimativa de uso/cota e solicitar armazenamento persistente quando disponível.
- Oferecer ações de remoção de faixa, pasta e biblioteca inteira.
- Verificar/renovar permissão de leitura dos handles ao reabrir a página e explicar quando a pasta precisar ser vinculada novamente.
- Manter HTML, CSS e JavaScript vanilla, sem etapa de build.

## Fora do escopo desta etapa

- Reprodução de áudio e controles de player, Media Session e segundo plano.
- Crossfade, histórico, fila, busca, favoritos, EQ e temporizador.
- Garantir suporte universal à File System Access API no Meta Quest Browser ou a todos os formatos de áudio e codecs.
- Validar o comportamento no Quest real; isso depende do teste do usuário após receber esta etapa.

## Critérios de sucesso

- Uma seleção de cerca de 20 arquivos MP3 importa e aparece na lista com progresso e sem travar toda a interface.
- Cancelar preserva os arquivos já salvos; selecionar novamente o lote ignora os itens já importados.
- O recarregamento da página mantém biblioteca e metadados no mesmo navegador.
- Metadados reconhecidos aparecem corretamente; tags ausentes ou incompatíveis não impedem a importação e recorrem ao nome do arquivo.
- O indicador de armazenamento mostra valores ou informa claramente quando a API não está disponível.
- O fluxo alternativo permite nomear o lote quando não há informação de pasta.
- Com a opção de pasta direta, os arquivos MP3 continuam em sua pasta do Quest e o site guarda handles/metadados, não cópias completas.

## Restrições e limites conhecidos

- A escolha de arquivos permanece sob controle do navegador e pode variar no Quest. A seleção múltipla com rótulo de coleção é o caminho de contingência.
- A API de armazenamento fornece estimativas e persistência solicitada, mas o navegador decide conceder persistência e definir limites; espaço livre no dispositivo pode reduzir a cota.
- A File System Access API exige contexto seguro e gesto do usuário; permissões dos handles podem expirar ou ser recusadas. Meta recomenda detecção de recursos no runtime e não publica garantia específica para cada API no Quest Browser.
- A rota de handles só funciona se os MP3 estiverem acessíveis no sistema de arquivos do próprio Quest. O usuário informou que consegue transferi-los para o headset.
- A seleção é limitada a MP3 (`.mp3`/`audio/mpeg`); o atributo `accept` é apenas uma dica do navegador, então arquivos incompatíveis devem ser ignorados com uma mensagem clara.
- Para MP3, `jsmediatags` documenta leitores ID3v1 e ID3v2. Arquivos sem tags reconhecíveis usam título pelo nome do arquivo; a capacidade de reproduzi-los será avaliada na etapa do player.
- O repositório upstream disponibiliza uma distribuição pronta para navegador e leitura de `File`/`Blob`. A biblioteca usa licença BSD-3-Clause, cujo aviso deverá acompanhar a cópia vendorizada.

## Abordagens consideradas

1. **Acesso direto à pasta do Quest com File System Access API (escolhida):** guardar handles de arquivo e metadados, sem copiar MP3 para a cota do site. Trade-off: requer API disponível no Quest, seleção explícita da pasta e possível renovação de permissão.
2. **Copiar blobs para IndexedDB:** mantém compatibilidade ampla e funcionamento sem a pasta original, mas 2,4 GiB de MP3 ultrapassam a cota de 2 GiB observada pelo usuário no Quest.
3. **Transmitir por servidor local na rede:** não usa a cota do Quest, mas exige PC/NAS ligado e rede disponível.

Escolhida a abordagem 1 para manter os arquivos no headset e evitar a cota do site. O usuário confirmou que consegue transferir as faixas para o Quest. A implementação deverá detectar suporte e manter a seleção de arquivos como fallback; a compatibilidade real será confirmada no teste em headset.

## Desenho funcional

- `index.html`, `style.css` e `app.js` formam a interface vanilla. O nome `app.js` segue o conjunto de arquivos especificado; o `script.js` inicial vazio será substituído ou removido durante a implementação.
- `vendor/jsmediatags.min.js` e o aviso de licença ficam no repositório e são carregados localmente.
- A interface oferece uma ação principal para escolher uma pasta do Quest com `showDirectoryPicker()` quando disponível. Quando indisponível, permanece a seleção múltipla de arquivos com nome de coleção e aviso de cota.
- O IndexedDB v2 mantém os stores `tracks`, `audio` e `fileHandles`. A seleção direta grava metadados e um handle indexado pelo ID da faixa; o áudio fica no filesystem do Quest. A alternativa de importação grava o blob no store `audio`.
- Handles serializados são guardados em IndexedDB; ao reabrir o app, consultar permissão e solicitar novamente quando necessário. Arquivos movidos/removidos são marcados como indisponíveis e podem ser vinculados novamente.
- Cada faixa é gravada de forma independente para que cancelamento ou falha não desfaça itens anteriores. A retomada reescaneia a pasta e ignora duplicatas por nome + tamanho.
- O parsing de tags e a obtenção de duração não bloqueiam a lista inteira; metadados ausentes ou erro de parser caem para título do arquivo e duração desconhecida.
- A remoção de faixa apaga os dois registros correspondentes; remoção de pasta usa o metadado da pasta para apagar todos os pares; apagar tudo limpa ambos os stores.
- `navigator.storage.estimate()` e `navigator.storage.persist()` são opcionais e tratados com fallback quando não existirem ou forem recusados. O modo de pasta direta não deve estimar os MP3 como dados duplicados do site.
- `manifest.json` e `sw.js` serão entregues nesta etapa como base estática para hospedagem e cache do shell. O comportamento instalável/offline completo e a etapa de publicação serão polidos e verificados na etapa 5, conforme o plano faseado do usuário.

## Decisões deixadas ao implementador

- Limitar o parser a metadados necessários à biblioteca para reduzir trabalho, usando título/artista/álbum/capa e duração do elemento de áudio quando disponível.
- Definir textos de estado e tratamento visual de falhas por arquivo sem interromper o restante do lote.
- Manter controles e tipografia grandes, alto contraste e tema escuro desde a primeira tela, para que a listagem seja confortável em VR.

## Referência técnica

- [README oficial do jsmediatags](https://github.com/aadsm/jsmediatags): distribuição para browser, suporte a `File`/`Blob`, leitores ID3 e estrutura de metadados.
- [Licença BSD-3-Clause do jsmediatags](https://github.com/aadsm/jsmediatags/blob/master/LICENSE.md).
- [Meta Quest Browser — detecção de recursos](https://developers.meta.com/horizon/documentation/web/browser-specs/).
- [Chrome — File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) e [handles serializáveis no IndexedDB](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api).
