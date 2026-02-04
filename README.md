# 📝 Anota Aí - Listas de Compras Compartilhadas em Tempo Real

Uma aplicação web moderna, instalável (PWA) e colaborativa para gerenciar listas de compras com sincronização instantânea. Construída com **Supabase** (PostgreSQL, Auth, Storage e Realtime) e arquitetura modular frontend.

**🔗 URL do Projeto:** [https://github.com/Kerlonk/Anotaai](https://github.com/Kerlonk/Anotaai)

---

## ✨ Funcionalidades Principais

### 🛒 Gestão Inteligente de Listas
- **Listas Compartilhadas**: Crie listas e convide familiares ou amigos para colaborar
- **Sincronização em Tempo Real**: Alterações refletem instantaneamente para todos os participantes (Supabase Realtime)
- **Gestão de Itens**: Adicione, edite, marque como concluído ou remova itens com quantidade, unidade e preço
- **Estatísticas em Tempo Real**: Visualize total de itens, concluídos e valor estimado da compra

### 👥 Sistema de Perfil e Colaboração
- **Perfil Completo**: Foto de avatar (upload para Supabase Storage), nome e nome de usuário
- **Busca e Compartilhamento**: Encontre usuários por nome, email ou username para compartilhar listas
- **Controle de Acesso**: Distinção clara entre **Dono** e **Convidado** em cada lista

### 📱 Experiência Moderna (PWA)
- **Instalável**: Adicione à tela inicial do celular ou computador como app nativo
- **Funciona Offline**: Acesso básico às páginas sem conexão (Cache First com Service Worker)
- **Design Responsivo**: Interface adaptada para desktop, tablet e smartphone
- **Modo Escuro/Claro**: Alternância suave entre temas com preferência salva

### 🔐 Autenticação Segura
- Login e registro com email/senha via **Supabase Auth**
- Sessão persistente e logout seguro

---

## 🏗️ Arquitetura e Tecnologias

### **Frontend (Client-Side)**
- **HTML5, CSS3 (com Variáveis CSS)**, JavaScript (ES6+)
- **Arquitetura Modular**: Separação clara entre estrutura (HTML), estilo (CSS) e lógica (JS)
- **Design Responsivo**: CSS Grid/Flexbox com media queries
- **PWA (Progressive Web App)**: `manifest.json` e `service-worker.js` para instalabilidade

### **Backend & Infraestrutura (Supabase - BaaS)**
- **Supabase**: Plataforma completa que substitui backend tradicional
  - **PostgreSQL**: Banco de dados relacional para `profiles` e `shopping_lists`
  - **Realtime**: Sincronização instantânea via subscriptions PostgreSQL
  - **Auth**: Sistema completo de autenticação de usuários
  - **Storage**: Bucket (`avatars`) para armazenar imagens de perfil

### **Recursos Externos**
- **Font Awesome**: Ícones vetoriais
- **Google Fonts**: Tipografia moderna (se aplicável)

---

## 📁 Estrutura do Projeto
Anotaai/
├── index.html # Página de Login/Registro
├── dashboard.html # Dashboard principal da aplicação
├── dashboard.css # Todos os estilos CSS (com modo escuro)
├── dashboard.js # Lógica principal (realtime, autenticação, CRUD)
├── config.js # Configuração do cliente Supabase
├── manifest.json # Configuração do PWA (nome, ícones, tema)
├── service-worker.js # Service Worker para cache e funcionamento offline
└── README.md # Documentação do projeto

---

## ⚙️ Configuração e Execução

### Pré-requisitos
1.  **Conta no Supabase**: [Crie uma conta gratuita](https://supabase.com)
2.  **Navegador Moderno**: Chrome, Edge, Firefox ou Safari atualizados
3.  **Servidor Web Local**: Python, Node.js ou extensão Live Server

### Passo 1: Configurar o Supabase
1.  Crie um novo projeto no Supabase
2.  Execute o script SQL necessário (se disponível no repositório) para criar as tabelas `profiles` e `shopping_lists`
3.  No menu **Storage**, crie um bucket público chamado `avatars`
4.  Configure as políticas (RLS) do bucket para permitir upload e leitura

### Passo 2: Configurar o Projeto Local
1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/Kerlonk/Anotaai.git
    cd Anotaai
    ```

2.  **Configure as credenciais do Supabase:**
    - No seu projeto Supabase, vá em **Project Settings > API**
    - Copie a `URL` e a `anon public` key
    - **IMPORTANTE**: Crie um arquivo `config.js` com **SUAS credenciais**:
    ```javascript
    // config.js - USE SUAS PRÓPRIAS CREDENCIAIS
    const SUPABASE_CONFIG = {
        url: 'https://seu-projeto.supabase.co',      // SUA URL AQUI
        anonKey: 'sua-chave-anon-publica-aqui'      // SUA CHAVE AQUI
    };
    const supabase = window.supabase.createClient(
        SUPABASE_CONFIG.url, 
        SUPABASE_CONFIG.anonKey
    );
    ```
    ⚠️ **Nunca comite** credenciais reais no Git. O `config.js` deve estar no `.gitignore`.

### Passo 3: Executar Localmente
1.  **Inicie um servidor web local:**
    ```bash
    # Opção 1: Python
    python -m http.server 8000
    
    # Opção 2: Node.js com http-server
    npx http-server
    
    # Opção 3: Use a extensão "Live Server" no VS Code
    ```

2.  **Acesse a aplicação:**
    - Abra `http://localhost:8000` no navegador
    - Registre um novo usuário e comece a usar

---

## 🗄️ Estrutura do Banco de Dados

### Tabela: `profiles`
- `id` (UUID, PK) - Referencia `auth.users`
- `email` (text) - Email do usuário
- `name` (text) - Nome completo
- `username` (text) - Nome de usuário único
- `avatar_url` (text) - URL da foto no Storage
- `created_at`, `updated_at` (timestamptz)

### Tabela: `shopping_lists`
- `id` (UUID, PK)
- `name` (text) - Nome da lista
- `description` (text) - Descrição opcional
- `items` (JSONB) - Array de objetos: `{name, quantity, unit, price, completed, added_by, added_at}`
- `owner_id` (UUID) - Referencia `profiles.id`
- `shared_with` (UUID[]) - Array de IDs dos usuários convidados
- `created_at`, `updated_at` (timestamptz)

**Políticas (RLS)**: Configuradas para que usuários só possam acessar listas das quais são donos ou foram convidados.

---

## 🔧 Pontos de Personalização

### Para Desenvolvedores/Contribuidores

1.  **Tema de Cores** (`dashboard.css`):
    ```css
    :root {
        --bg-primary: #f8f9fa;          /* Cor de fundo principal */
        --sidebar-bg: #2c3e50;          /* Cor da sidebar */
        --primary-color: #4361ee;       /* Cor primária (botões, links) */
        /* ... */
    }
    ```

2.  **Adicionar Novos Campos ao Perfil**:
    - Adicione o campo em `dashboard.html` (formulário de perfil)
    - Atualize a função `saveProfile()` em `dashboard.js`
    - Adicione a coluna na tabela `profiles` do Supabase

3.  **Estender Funcionalidades**:
    - A lógica está organizada em seções comentadas em `dashboard.js`
    - Para novas funcionalidades, adicione funções após a seção correspondente

---

## 🧪 Testando a Aplicação

1.  **Registro**: Crie duas contas com emails diferentes
2.  **Perfil**: Faça upload de avatar e edite informações
3.  **Listas**: Crie uma lista e adicione alguns itens
4.  **Compartilhamento**: Busque o segundo usuário e compartilhe a lista
5.  **Realtime**: Abra a lista em dois navegadores e edite itens simultaneamente
6.  **PWA**: Use o menu do navegador para "Instalar Anota Aí"

---

## 📄 Licença

Este projeto foi desenvolvido para fins educacionais e de portfólio. Sinta-se à vontade para usá-lo como referência.

---

**✨ Projeto desenvolvido com foco em experiência do usuário e tecnologia moderna.**  
**Versão:** 6.2 - Realtime & PWA  
**Autor:** [Kerlonk](https://github.com/Kerlonk)
