# Skill Recruiter

English: [README.md](README.md)

Roteador e curador de skills do Claude Code. Escolhe as skills certas para cada tarefa e mantém
honesta a prateleira onde elas moram.

Instalar skill é fácil. Saber qual presta, não. Catálogo diz o que a skill **promete**. Isto aqui
diz o que ela **entrega**.

```
busca no GitHub  →  quarentena  →  análise  →  bancada  →  perfil  →  ativa
                                                   ↓
                                                arquivo
```

Nada chega na sua pasta de skills sem passar por aqui. Skill baixada cai na quarentena, que não é
carregada em sessão nenhuma. Reprovada vai para o arquivo com o laudo, e volta com um comando.

## Por quê

Skill é instrução que o seu agente obedece. Isso enfraquece os sinais de sempre:

- **Estrela mede popularidade, não resultado.** Skill com oito mil estrelas pode entregar layout
  com cara de template. Uma com sessenta pode ser exatamente o que você queria.
- **Descrição é o autor se elogiando.** Duas skills com descrição quase idêntica entregam
  resultados opostos o tempo todo.
- **Ninguém lê o que instala.** Um `SKILL.md` pode apontar para arquivos que nunca foram
  empacotados, delegar para skills que você não tem, ou mandar rodar comando destrutivo.

Auditando 97 skills instaladas com esta ferramenta: **13 prometiam arquivo que não existe** (uma
delas citava 34), e **22 não tinham conteúdo próprio** — checklist sem nada para conferir, ou
stub delegando para skill não instalada.

## Instalação

Precisa de Node 18+ e git. `gh` é opcional, mas recomendado para a busca no GitHub.

```bash
git clone https://github.com/<voce>/skill-recruiter.git
cd skill-recruiter
./install.sh
```

O instalador copia `skill/` para a sua pasta de skills como `skill-recruiter`. Os caminhos são
resolvidos nesta ordem: `$SKILLS_HOME`, `~/.claude/skills`, `~/.claude-shared/skills`. Quarentena e
arquivo nascem ao lado do que for encontrado.

Depois reinicie o Claude Code.

## Fazendo disparar a cada prompt

O roteador só serve se ele roda antes do trabalho começar, não depois. Dois jeitos:

**Uma linha no `CLAUDE.md`** — o simples, funciona em qualquer lugar:

```markdown
Antes de qualquer tarefa técnica — escrever código, mexer em UI, revisar, testar, mexer em banco —
invoque `skill-recruiter` com a tarefa como argumento. Ele lê o catálogo, monta o stack certo
(máx. 4 skills, na ordem certa) e mostra a escolha antes de executar.

Pular só quando: pergunta pura, comando de harness, conversa, ou quando eu nomeei uma skill.
```

Mantenha a lista de exceções. Sem ela o roteador dispara em "o que faz esse arquivo?" e gasta um turno.

**Um hook `UserPromptSubmit`** — para quando você quer obrigação, não sugestão. Em
`~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          { "type": "command", "command": "echo 'Route through skill-recruiter before technical work.'" }
        ]
      }
    ]
  }
}
```

O hook injeta o lembrete em todo prompt. A linha no `CLAUDE.md` é conselho que o modelo pondera; o
hook é texto que ele sempre recebe. Comece pela linha — a maioria nunca precisa do hook.

## Comandos

```bash
# achar
node scripts/discover.mjs search "prisma database"
node scripts/discover.mjs inspect microsoft/playwright --filter component
node scripts/discover.mjs fetch microsoft/playwright packages/.../playwright-trace

# ler
node scripts/analyze.mjs --all                        # tudo que está na quarentena
node scripts/analyze.mjs --installed --project ~/app  # auditoria do que já está ativo

# provar
node scripts/bench.mjs setup visual skill-a skill-b --probe visual-mobile
node scripts/bench.mjs compare <pasta> --open
node scripts/bench.mjs verdict <pasta> --winner skill-a --delivers "..."

# limpar a prateleira
node scripts/shelf.mjs list
node scripts/shelf.mjs overlap
node scripts/shelf.mjs promote <nome>
node scripts/shelf.mjs archive <nome> --reason "..."
```

## O que a análise mede

| eixo | o que pega |
|---|---|
| referência morta | a skill manda abrir arquivo que ela nunca entregou |
| dependência fantasma | delega para skills que não estão instaladas aqui |
| substância | checklist sem nada para conferir; stub "use @outra-skill"; afirmação sem exemplo |
| perigo | comando destrutivo, leitura de credencial, edição da configuração do harness |
| versão | mira uma major que o seu projeto não roda |
| sobreposição | cobre o mesmo terreno de algo já instalado |

**Veto automático existe para uma classe só: skill que agiria contra o operador.** O resto é
recomendação, porque skill de aparência estranha ainda pode ser a certa. Três calibragens, cada uma
nascida de um falso positivo em dado real:

- Linha negada é aviso, não ataque. "**Não** gere um `.npmrc` com token" é a skill te protegendo.
- Skill sobre atacar sistema contém comando de ataque. É o assunto dela; o achado cai para médio
  com nota, em vez de vetar.
- Skill cuja descrição declara trabalho de configuração pode dizer que mexe em configuração.

Citar um risco em prosa não é o mesmo que mandar rodar, então os achados só disparam de comando ou
de ordem no imperativo.

## A bancada

De duas a quatro skills, a mesma prova, resultados lado a lado sem nome à vista.

**Às cegas** — a ordem sai no sorteio. Saber qual é a que você já usa contamina a escolha.

**Isoladas** — um agente por lado, disparados juntos, nenhum enxerga o trabalho do outro. Rodar
duas skills no mesmo contexto faz a segunda copiar a primeira, e aí você mede ordem, não qualidade.

**Quem julga depende da faixa** — faixa objetiva (backend, banco, segurança, tipagem, teste) se
decide por critério medível: mais seguro, depois mais rápido, depois melhor prática. Faixa visual
se decide olhando, em largura de celular primeiro.

`--keep-all` é o resultado mais comum em faixa estética. A perdedora não perdeu; entrega outra
coisa. As duas ficam, as duas ganham perfil, e o roteador passa a escolher pela situação.

Seis provas vêm junto: `visual`, `visual-mobile`, `data`, `code`, `security`, `nextjs`. Cada uma
deixa cor, tipografia e arquitetura em aberto de propósito — o que a skill preenche sozinha é
justamente o que está sendo medido. Prova nova é mais um arquivo em `probes/`.

## Licença

MIT.
