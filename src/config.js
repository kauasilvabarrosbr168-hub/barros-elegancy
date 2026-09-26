// ============================================================
// CONFIGURAÇÃO DA BARROS — tudo que muda sem mexer no código
// ============================================================

export const CONFIG = {
  // Link externo do botão "RESERVE A SUA" (checkout, loja, Instagram...).
  // Se precisar de um link diferente por cor/tamanho, preencha `porVariante`:
  //   porVariante: { 'preta-M': 'https://...', 'branca-G': 'https://...' }
  reserva: {
    url: '',
    porVariante: {},
  },

  // Modelo 3D da polo. Coloque o arquivo em public/models/.
  // - Um arquivo só (polo.glb): o site recolore preta/branca pelos nomes dos materiais
  //   (gola/collar e logo são reconhecidos). Mesma modelagem nas duas cores.
  // - Dois arquivos (polo-preta.glb e polo-branca.glb): usa cada um na sua cor.
  // Enquanto não houver .glb, o site usa os mockups (frente, 3/4 e costas).
  modelos: {
    unico: '/models/polo.glb',
    preta: '/models/polo-preta.glb',
    branca: '/models/polo-branca.glb',
  },

  tamanhos: ['P', 'M', 'G', 'GG'],

  cores: [
    { id: 'preta', nome: 'Preta' },
    { id: 'branca', nome: 'Branca' },
  ],
};

// Pontos de detalhe da peça.
// `img`: posição [x, y] (0–1) na foto 3/4 — usado enquanto não houver .glb.
// `modelo`: posição normalizada [x, y, z] na caixa do .glb (-0.5 a 0.5), com a
//           peça virada para a câmera. Ajuste quando o modelo chegar.
// `giro`: rotação da peça (graus) ao focar esse detalhe no modo 3D.
export const HOTSPOTS = [
  {
    id: 'tecido',
    rotulo: 'Tecido',
    titulo: 'Tecido tecnológico',
    texto: 'Desenvolvido para acompanhar o movimento.',
    lista: ['Leve', 'Alta elasticidade', 'Conforto', 'Mobilidade', 'Secagem rápida'],
    img: [0.47, 0.7], modelo: [0.05, -0.18, 0.5], giro: 0, zoom: 1.35,
  },
  {
    id: 'recorte',
    rotulo: 'Recorte do peito',
    titulo: 'Design em movimento',
    texto: 'O recorte em V acompanha a construção do corpo masculino e dá à peça uma identidade visual própria.',
    img: [0.37, 0.445], modelo: [0, 0.05, 0.5], giro: 0, zoom: 1.5,
  },
  {
    id: 'alivio',
    rotulo: 'Pontos de alívio',
    titulo: 'Construção estratégica',
    texto: 'Recortes e costuras posicionados para melhorar a mobilidade e distribuir a tensão do tecido durante os movimentos.',
    img: [0.77, 0.6], modelo: [0.42, -0.05, 0.1], giro: -40, zoom: 1.55,
  },
  {
    id: 'mangas',
    rotulo: 'Mangas',
    titulo: 'Liberdade nos braços',
    texto: 'Acabamento limpo na barra, conforto e espaço para o braço trabalhar em qualquer movimento.',
    img: [0.1, 0.4], modelo: [-0.46, 0.22, 0.1], giro: 35, zoom: 1.6,
  },
  {
    id: 'logo',
    rotulo: 'Logo',
    titulo: 'Identidade minimalista',
    texto: 'A marca aparece de forma discreta, para a peça não virar um uniforme esportivo.',
    img: [0.53, 0.255], modelo: [0.2, 0.28, 0.5], giro: 0, zoom: 1.9,
  },
  {
    id: 'gola',
    rotulo: 'Gola',
    titulo: 'Acabamento premium',
    texto: 'Gola construída para manter a forma e o caimento, do primeiro set à última reunião.',
    img: [0.36, 0.1], modelo: [0, 0.46, 0.25], giro: 0, zoom: 1.7,
  },
];
