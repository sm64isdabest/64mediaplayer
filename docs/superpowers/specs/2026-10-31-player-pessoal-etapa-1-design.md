# Player pessoal para Quest — design da etapa 1

## Intenção

Construir a primeira etapa de um media player web pessoal para importar cerca de 600 arquivos MP3 locais, guardá-los no navegador e consultar a biblioteca offline. O primeiro teste será com aproximadamente 20 faixas no Meta Quest 3S.

## Objetivos

- Importar arquivos MP3 em lotes por seleção múltipla ou seleção de pasta quando o navegador oferecer `webkitdirectory`.
- Recuperar caminhos de pasta via `webkitRelativePath`; quando indisponíveis, perguntar o nome da coleção do lote.
- Ler título, artista, álbum, duração e capa quando as tags forem reconhecidas; usar o nome do arquivo como título alternativo.
- Guardar os blobs de áudio e os metadados em object stores separados do IndexedDB.
- Mostrar progresso, permitir cancelar a importação e retomar selecionando os mesmos arquivos, ignorando duplicatas detectadas por nome + tamanho.
- Listar metadados sem carregar todos os blobs e exibir as pastas da biblioteca.
- Exibir estimativa de uso/cota e solicitar armazenamento persistente quando disponível.
- Oferecer ações de remoção de faixa, pasta e biblioteca inteira.
- Manter HTML, CSS e JavaScript vanilla, sem etapa de build.

## Fora do escopo desta etapa

- Reprodução de áudio e controles de player, Media Session e segundo plano.
- Crossfade, histórico, fila, busca, favoritos, EQ e temporizador.
- Garantir suporte universal a todos os formatos de áudio e codecs dos navegadores.
- Validar o comportamento no Quest real; isso depende do teste do usuário após receber esta etapa.

## Critérios de sucesso

- Uma seleção de cerca de 20 arquivos MP3 importa e aparece na lista com progresso e sem travar toda a interface.
- Cancelar preserva os arquivos já salvos; selecionar novamente o lote ignora os itens já importados.
- O recarregamento da página mantém biblioteca e metadados no mesmo navegador.
- Metadados reconhecidos aparecem corretamente; tags ausentes ou incompatíveis não impedem a importação e recorrem ao nome do arquivo.
- O indicador de armazenamento mostra valores ou informa claramente quando a API não está disponível.
- O fluxo alternativo permite nomear o lote quando não há informação de pasta.

## Restrições e limites conhecidos

- A escolha de arquivos permanece sob controle do navegador e pode variar no Quest. A seleção múltipla com rótulo de coleção é o caminho de contingência.
- A API de armazenamento fornece estimativas e persistência solicitada, mas o navegador decide conceder persistência e definir limites; espaço livre no dispositivo pode reduzir a cota.
- A seleção é limitada a MP3 (`.mp3`/`audio/mpeg`); o atributo `accept` é apenas uma dica do navegador, então arquivos incompatíveis devem ser ignorados com uma mensagem clara.
- Para MP3, `jsmediatags` documenta leitores ID3v1 e ID3v2. Arquivos sem tags reconhecíveis usam título pelo nome do arquivo; a capacidade de reproduzi-los será avaliada na etapa do player.
- O repositório upstream disponibiliza uma distribuição pronta para navegador e leitura de `File`/`Blob`. A biblioteca usa licença BSD-3-Clause, cujo aviso deverá acompanhar a cópia vendorizada.

## Abordagens consideradas

1. **Distribuição local de `jsmediatags` (escolhida):** copiar a distribuição de navegador minificada para `vendor/` e carregá-la localmente. Evita depender de CDN durante a importação, permite manter o parser disponível offline após o app ter sido carregado e não exige build. Trade-off: adiciona um arquivo de terceiro ao repositório e exige preservar o aviso de licença e atualizar a cópia manualmente.
2. **Carregar `jsmediatags` por CDN:** reduz o tamanho do repositório, mas a primeira importação com tags depende de rede e disponibilidade do CDN. Isso é menos robusto para a meta de uso offline.

Escolhida a abordagem 1 por favorecer a independência de rede. A recomendação se baseia na distribuição de navegador documentada pelo [repositório oficial](https://github.com/aadsm/jsmediatags), que aceita `File` e `Blob` e lista leitores ID3. O projeto declara BSD-3-Clause; a cópia local manterá o arquivo de licença/aviso.

## Desenho funcional

- `index.html`, `style.css` e `app.js` formam a interface vanilla. O nome `app.js` segue o conjunto de arquivos especificado; o `script.js` inicial vazio será substituído ou removido durante a implementação.
- `vendor/jsmediatags.min.js` e o aviso de licença ficam no repositório e são carregados localmente.
- A interface oferece dois seletores de MP3: arquivos múltiplos e diretório, ocultando ou desativando o seletor de diretório quando não suportado. A pasta relativa é preservada; sem ela, um campo simples solicita a coleção do lote.
- O IndexedDB usa stores separados para blobs e metadados, indexados por um ID estável. O identificador de duplicata é nome + tamanho, conforme solicitado.
- Cada faixa é gravada de forma independente para que cancelamento ou falha não desfaça itens anteriores. A retomada processa o lote novamente e classifica duplicatas como ignoradas.
- O parsing de tags e a obtenção de duração não bloqueiam a lista inteira; metadados ausentes ou erro de parser caem para título do arquivo e duração desconhecida.
- A remoção de faixa apaga os dois registros correspondentes; remoção de pasta usa o metadado da pasta para apagar todos os pares; apagar tudo limpa ambos os stores.
- `navigator.storage.estimate()` e `navigator.storage.persist()` são opcionais e tratados com fallback quando não existirem ou forem recusados.
- `manifest.json` e `sw.js` serão entregues nesta etapa como base estática para hospedagem e cache do shell. O comportamento instalável/offline completo e a etapa de publicação serão polidos e verificados na etapa 5, conforme o plano faseado do usuário.

## Decisões deixadas ao implementador

- Limitar o parser a metadados necessários à biblioteca para reduzir trabalho, usando título/artista/álbum/capa e duração do elemento de áudio quando disponível.
- Definir textos de estado e tratamento visual de falhas por arquivo sem interromper o restante do lote.
- Manter controles e tipografia grandes, alto contraste e tema escuro desde a primeira tela, para que a listagem seja confortável em VR.

## Referência técnica

- [README oficial do jsmediatags](https://github.com/aadsm/jsmediatags): distribuição para browser, suporte a `File`/`Blob`, leitores ID3 e estrutura de metadados.
- [Licença BSD-3-Clause do jsmediatags](https://github.com/aadsm/jsmediatags/blob/master/LICENSE.md).
