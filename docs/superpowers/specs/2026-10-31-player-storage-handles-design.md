# Player pessoal — leitura direta dos MP3 no Quest

## Intenção

Evitar copiar a biblioteca de cerca de 673 MP3 (2,40 GiB na pasta disponível) para o armazenamento do site, cuja cota observada no Quest é 2 GiB. O usuário confirmou que consegue transferir os arquivos para o Quest.

## Objetivos

- Usar a File System Access API para escolher uma pasta do Quest e ler MP3 da pasta original sem duplicar bytes no IndexedDB.
- Guardar metadados e handles de pastas no IndexedDB; armazenar blobs somente no fallback por input de arquivo.
- Manter a biblioteca disponível offline se a pasta continuar no headset e a permissão do navegador estiver concedida.
- Tratar API ou permissões indisponíveis com mensagens claras e um fallback manual por arquivos.
- Preservar lista virtualizada, progresso, cancelamento, retomada e deduplicação por nome + tamanho.

## Fora do escopo

- Aumentar ou contornar artificialmente a cota por origem do navegador.
- Confirmar suporte da File System Access API no Quest sem teste no headset.
- Reprodução, Media Session e crossfade; continuam pertencendo às etapas posteriores.

## Abordagens

1. **Ler direto da pasta do Quest (escolhida):** guardar um `FileSystemDirectoryHandle` por pasta e metadados/paths por faixa; não salvar cópia dos MP3 no IndexedDB. Mantém uso de armazenamento do site baixo e permite trabalhar offline no headset. Trade-off: exige que os MP3 estejam no Quest, HTTPS, suporte da API e permissão de leitura que pode precisar ser renovada.
2. **Copiar arquivos para IndexedDB:** compatível com o fluxo existente, porém a biblioteca de 2,40 GiB excede o limite observado.
3. **Servidor local pela rede:** evita a cota, mas exige computador/NAS ligado e rede disponível durante a reprodução.

A opção 1 foi escolhida porque o usuário consegue transferir as músicas ao Quest e quer usá-las sem assinatura. A Meta recomenda detectar recursos em tempo de execução; a compatibilidade real será testada no headset. O Chromium documenta handles serializáveis em IndexedDB e a API de escolha de diretório, mas as permissões podem exigir nova autorização.

## Desenho

- Botão principal “Escolher pasta no Quest” chama `showDirectoryPicker()` diretamente a partir do gesto do usuário.
- Recursivamente enumerar MP3, ler tags/duração do `File` temporário e guardar cada faixa com `source: "handle"`, `folderId` e `relativePath`.
- Guardar o handle raiz da pasta num object store `fileHandles`; guardar metadados no store `tracks`; manter store `audio` somente para o fluxo fallback. Upgrade do banco para versão 2 preserva as faixas antigas como `source: "blob"`.
- Ao reabrir, verificar permissão do handle raiz. Se `queryPermission()` não for `granted`, mostrar ação para pedir permissão de novo em gesto explícito. Se o handle ou arquivo não existir, sinalizar e permitir reimportar/vincular pasta.
- O fallback `<input type="file">` continua disponível. Ele pode copiar blobs apenas se a estimativa de armazenamento deixar espaço; caso contrário, informar que esta biblioteca excede a cota e direcionar o usuário para o seletor de pasta.
- Remover faixa/pasta apaga metadados e referências; não altera nem apaga os MP3 originais do usuário.
- `navigator.storage.estimate()` passa a medir somente os dados mantidos pelo site; a interface informa que os MP3 permanecem na pasta escolhida.

## Critérios de sucesso

- No Quest com `showDirectoryPicker()`, selecionar uma pasta com ~20 MP3 e obter lista completa sem gravar os blobs no store `audio`.
- Reabrir o site offline e listar as faixas; se a permissão persistir, abrir handles. Se a permissão for renovada, obter acesso após confirmação do usuário.
- Se a API não existir, manter seleção múltipla visível, explicar o limite aproximado e nunca tentar copiar silenciosamente uma biblioteca que excede a cota.
- Cancelar/repetir varredura não cria duplicatas. Remover registros do site não apaga os arquivos originais.

## Decisões deixadas ao implementador

- Usar um handle raiz por pasta importada e resolver cada `relativePath` a partir dele; evitar salvar centenas de handles de arquivo independentes.
- Reusar a leitura de tags do `metadata.js` e a renderização existente.

## Referências

- [Meta Quest Browser: detectar recursos no runtime](https://developers.meta.com/horizon/documentation/web/browser-specs/).
- [Chrome: File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access).
- [Chrome: permissões persistentes e handles no IndexedDB](https://developer.chrome.com/blog/persistent-permissions-for-the-file-system-access-api).
- [MDN: cotas e APIs de armazenamento por origem](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API/Storage_quotas_and_eviction_criteria).
