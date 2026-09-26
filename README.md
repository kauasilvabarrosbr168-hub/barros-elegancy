# BARROS — Elegância em Movimento

Site de lançamento da Polo BARROS. É uma experiência contada pelo scroll: abertura com o logo, o tecido revelando a peça, a polo em 360°, os detalhes, o homem BARROS em movimento (tênis, conforto, negócios), o manifesto, "para quem é" e a reserva do primeiro drop.

Feito com Vite, Three.js (WebGL) e Lenis (rolagem suave), sem framework.

## Rodar e publicar

```bash
npm install
npm run dev       # desenvolvimento
npm run build     # gera a pasta dist/ para publicar
```

Para publicar, envie a pasta `dist/` para a Vercel, a Netlify ou qualquer hospedagem estática. Outra opção é conectar o repositório e usar `npm run build` como comando de build e `dist` como pasta de saída.

## O que editar (tudo em `src/config.js`)

| O quê | Onde |
|---|---|
| Link do botão **"Reserve a sua"** | `reserva.url` (ou um link por cor e tamanho em `reserva.porVariante`) |
| Tamanhos | `tamanhos` |
| Textos e posição dos 6 detalhes (tecido, recorte, alívio, mangas, logo, gola) | `HOTSPOTS` |

Enquanto `reserva.url` estiver vazio, o botão avisa que o link ainda não foi configurado.

## Giro 360° a partir de vídeo

O 360° da peça usa um vídeo de cada cor, com a câmera parada, a peça girando uma volta completa e fundo claro liso. O script transforma cada vídeo em 48 quadros igualmente espaçados:

```bash
npm run spin -- preta  assets-src/giro-preta.mp4
npm run spin -- branca assets-src/giro-branca.mp4 48 --pular 175-185 --inverter
```

- Ele mede o ângulo real de cada quadro e corrige a velocidade irregular dos vídeos feitos por IA.
- Remove o fundo e o pedestal, alinha os quadros e grava WebP leves em `public/img/giro/<cor>/`.
- Peça clara sobre fundo claro usa IA local (rembg) para o recorte. A instalação é feita uma vez: `python -m venv .venv && .venv/Scripts/python -m pip install "rembg[cpu]"`.
- `--pular a-b` descarta quadros com defeito, como o trecho "fantasma" em que a IA misturou duas vistas.
- `--inverter` corrige um vídeo que gira no sentido oposto ao da outra cor.

Nos detalhes (zoom), o site continua usando o mockup 3/4, que é mais nítido que o vídeo.

## Personagem 3D (capítulo "Movimento")

O homem BARROS é o boneco **X Bot** do Mixamo vestindo uma **polo 3D presa ao esqueleto**, então manga, tronco e barra se mexem com o corpo. O corpo aparece em partículas.

```bash
npm run character   # gera public/models/barros-man.json + .bin
```

O script `scripts/prepare-character.mjs` faz o seguinte:

- Lê o X Bot e as animações de `assets-src/mixamo/`.
- Constrói a polo como uma casca contínua a 1,5 cm do corpo, com caimento reto a partir da axila, barra solta e gola.
- Prende a polo aos mesmos ossos do boneco.
- Gera os pontos das partículas e compacta as animações.

A linha do tempo fica em `src/gl/movimento3d.js` (`TL`):

- **Saque e forehand:** poses próprias (`src/pose.js`), convertidas para o esqueleto.
- **Espera, corrida lateral, alongamento, caminhada, em pé, café, conversa e aperto de mão:** animações do Mixamo.

Os detalhes da polo (logo no peito e nas costas, recorte em V, carcela e botões, etiqueta, cores) ficam em `src/gl/character.js`, função `makeShirtMaterial`.

Para adicionar ou trocar uma animação do Mixamo:

1. Use o personagem X Bot.
2. Baixe com Format FBX Binary, Skin "Without Skin", 30 fps e "In Place" quando existir.
3. Salve o arquivo em `assets-src/mixamo/`.
4. Coloque o nome dele na `TL` e rode `npm run character`.

## Modelo 3D da polo (.glb), opcional

Com os vídeos, o .glb deixou de ser necessário. Se um dia houver um modelo 3D real:

1. Coloque o arquivo em `public/models/`:
   - **um arquivo** `polo.glb`: o site recolore em preta e branca, com a gola dourada na branca. A gola é reconhecida pelo nome do material (`gola`, `collar`, `trim`) e o logo por `logo`, `label` ou `tag`.
   - **ou dois arquivos** `polo-preta.glb` e `polo-branca.glb`: cada um na sua cor.
2. Pronto. O site detecta o arquivo sozinho e troca as fotos pelo 3D, sem outra mudança.
3. Depois, ajuste em `HOTSPOTS` os campos `modelo` (posição de cada detalhe na peça, de -0.5 a 0.5) e `giro` (ângulo da câmera em cada detalhe).

Para o modelo funcionar bem:

- frente virada para +Z e Y para cima;
- menos de ~5 MB;
- pode vir com compressão Draco ou Meshopt, que o site já suporta.

## Trocar as fotos

Substitua os originais em `assets-src/` (`logo.png`, `polo-preta.png`, `polo-branca.png`, no mesmo layout dos mockups atuais) e rode:

```bash
npm run assets
```

O script remove o fundo, recorta as 3 vistas e gera as versões WebP leves que o site usa.

## Parâmetros de URL

- `?cor=branca`: abre já na versão branca (bom para links diretos e anúncios).
- `?q=low` / `?q=mid` / `?q=high`: força a qualidade do 3D.
- `?nogl`: mostra o modo sem 3D (fallback para aparelhos sem WebGL).
- `?at=peca:0.5`: pula para um ponto da história (`hero`, `peca`, `movimento`, `manifesto`, `paraquem` ou o id de uma seção).

## Desempenho e acessibilidade

- A qualidade do 3D se ajusta ao aparelho: celulares e máquinas modestas usam menos partículas e resolução menor.
- Sem WebGL, o site mostra as fotos, o personagem em SVG e as mesmas animações de texto.
- Com `prefers-reduced-motion` ativado, a rolagem suave e as animações longas ficam desligadas.
- O giro da peça também funciona pelo teclado, com as setas ← →.

## Estrutura

```
src/
  config.js        conteúdo editável (reserva, modelos, detalhes)
  main.js          maestro: scroll, batidas de texto, controles, fallback
  pose.js          esqueleto e poses do homem BARROS (tênis, conforto, negócios)
  style.css        visual
  gl/
    stage.js       canvas único; cada cena acompanha sua seção
    hero.js        partículas do logo na abertura
    fabric.js      tecidos preto/branco e o limbo de luz
    polo.js        a polo: fotos hoje, .glb quando chegar
    athlete.js     personagem de partículas vestindo a polo
    world.js       cenário em linhas (quadra -> arquitetura) e a bola
    views.js       coreografia de câmera por capítulo
  ui/
    figure-svg.js  o personagem em traço (fallback e cards)
    cards.js       cenas "para quem é" e a malha de elasticidade
scripts/prepare-assets.mjs   gera as imagens a partir de assets-src/
```
