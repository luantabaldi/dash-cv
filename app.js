// --- ESTADO GLOBAL DA APLICAÇÃO ---
const state = {
    // Configurações do Supabase (Fallback para chaves do .env)
    supabaseUrl: '',
    supabaseKey: '',
    projectRef: 'zprybshuoakdjqtdqgog',
    defaultKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inpwcnlic2h1b2FrZGpxdGRxZ29nIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNjYzNTQsImV4cCI6MjA5NDg0MjM1NH0.ti05YfIKHgECBdB7ZmdpJxxeQVgr5M9Mb9fpL00i9a8',
    
    // Aba Ativa (SPA Navigation)
    activeTab: 'comercial',

    // Conjuntos de Dados originais (cache local completo de todas as páginas do Supabase)
    data: {
        leads: [],
        sla: [],
        sales: [],
        attribution: [],
        corretores: [],
        imobiliarias: [],
        tarefas: []
    },
    
    // Filtros Ativos
    filters: {
        imobiliaria: 'all',
        corretor: 'all',
        origemPrimeira: 'all',
        origemUltima: 'all',
        empPrimeiro: 'all',
        empUltimo: 'all',
        momento: 'all',
        ano: 'all',
        mes: 'all',
        stage: null // Filtro clicado no Funil
    },
    
    // Controle da Tabela de Leads (Aba Comercial)
    table: {
        currentPage: 1,
        pageSize: 6,
        filteredLeads: []
    },
    
    // Instâncias de Gráficos Chart.js
    charts: {
        marketing: null,
        dirSales: null,
        dirMediaSales: null,
        crmDiscard: null
    }
};

// --- CONFIGURAÇÃO DE ETAPAS DE SITUAÇÃO DO FUNIL ---
// Mapeamento idsituacao conforme schema_migration e medidas DAX homologadas
const STAGE_IDS = {
    novo: [], // Padrão: Todos
    atendimento: [4, 15, 9, 8, 5, 6, 12, 16, 13, 14, 20],
    visitaAgendada: [9, 8, 5, 6, 20],
    visitaRealizada: [8, 5, 6, 20],
    proposta: [5, 6, 20],
    venda: [6]
};

// --- AUXILIARES E UTILITÁRIOS ---
function calculateMedian(arr) {
    if (!arr || arr.length === 0) return 0;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function recreateLucideIcons() {
    if (window.lucide) {
        window.lucide.createIcons({
            attrs: {
                'stroke-width': 1.9,
                width: 16,
                height: 16
            }
        });
    }
}

// --- INICIALIZAÇÃO DA APLICAÇÃO ---
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    loadSettings();
    initEventListeners();
    fetchInitialData();
});

// --- SISTEMA DE TEMA ECLIPTICA (LIGHT / DARK) ---
function initTheme() {
    const savedTheme = localStorage.getItem('lt-theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const btn = document.getElementById('btn-theme-toggle');
    if (!btn) return;
    
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
        btn.innerHTML = '<i data-lucide="sun"></i>';
    } else {
        document.documentElement.classList.remove('dark');
        btn.innerHTML = '<i data-lucide="moon"></i>';
    }
    recreateLucideIcons();
    
    btn.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        
        document.documentElement.setAttribute('data-theme', newTheme);
        if (newTheme === 'dark') {
            document.documentElement.classList.add('dark');
            btn.innerHTML = '<i data-lucide="sun"></i>';
        } else {
            document.documentElement.classList.remove('dark');
            btn.innerHTML = '<i data-lucide="moon"></i>';
        }
        recreateLucideIcons();
        localStorage.setItem('lt-theme', newTheme);
        
        // Recalcula e re-renderiza a visualização ativa para atualizar as cores dos gráficos
        applyFiltersAndRender();
    });
}

function getChartTheme() {
    const isDark = document.documentElement.classList.contains('dark');
    return {
        textColor: isDark ? '#FFFFFF' : '#17171A',
        gridColor: isDark ? 'rgba(46, 46, 52, 0.4)' : 'rgba(20, 20, 22, 0.06)',
        fontFamily: 'Inter, sans-serif'
    };
}

// --- CONTROLE DE CONFIGURAÇÕES / LOCAL STORAGE ---
function loadSettings() {
    const savedRef = localStorage.getItem('db_project_ref');
    const savedKey = localStorage.getItem('db_anon_key');
    
    // Validação robusta para evitar falha por chaves vazias ou inválidas no localStorage
    const isValidRef = savedRef && savedRef.trim().length === 20;
    const isValidKey = savedKey && savedKey.trim().startsWith('ey') && savedKey.trim().length > 50;
    
    state.projectRef = isValidRef ? savedRef.trim() : 'zprybshuoakdjqtdqgog';
    state.supabaseKey = isValidKey ? savedKey.trim() : state.defaultKey;
    state.supabaseUrl = `https://${state.projectRef}.supabase.co/rest/v1`;
    
    // Atualiza os inputs do modal com os valores atuais
    document.getElementById('settings-project-ref').value = state.projectRef;
    document.getElementById('settings-anon-key').value = isValidKey ? state.supabaseKey : '';
}

function saveSettings(projectRef, anonKey) {
    if (!projectRef.trim() || !anonKey.trim()) {
        alert('Por favor, preencha todos os campos!');
        return;
    }
    
    localStorage.setItem('db_project_ref', projectRef.trim());
    localStorage.setItem('db_anon_key', anonKey.trim());
    
    loadSettings();
    closeModal();
    fetchInitialData();
}

function restoreDefaultSettings() {
    localStorage.removeItem('db_project_ref');
    localStorage.removeItem('db_anon_key');
    
    loadSettings();
    closeModal();
    fetchInitialData();
}

// --- CONEXÃO INTEGRAL COM SUPABASE COM PAGINAÇÃO LOOP (SUPABASE FETCH ALL) ---
async function supabaseFetchAll(endpoint, selectQuery = '*') {
    let allData = [];
    const limit = 1000;
    let page = 0;
    
    const headers = {
        'apikey': state.supabaseKey,
        'Authorization': `Bearer ${state.supabaseKey}`,
        'Content-Type': 'application/json'
    };
    
    while (true) {
        const offset = page * limit;
        const url = `${state.supabaseUrl}/${endpoint}?select=${selectQuery}&limit=${limit}&offset=${offset}`;
        
        try {
            const response = await fetch(url, {
                headers: headers
            });
            
            if (!response.ok) {
                throw new Error(`Erro HTTP: ${response.status} na tabela/view ${endpoint}`);
            }
            
            const data = await response.json();
            if (!data || data.length === 0) {
                break;
            }
            
            allData = allData.concat(data);
            
            if (data.length < limit) {
                break;
            }
            
            page++;
            if (page > 100) {
                break;
            }
        } catch (error) {
            console.error(`Erro ao efetuar carga de ${endpoint}:`, error);
            throw error;
        }
    }
    return allData;
}

// --- FUNÇÕES UTILITÁRIAS DE DATA TIMEZONE-SAFE ---
function parseDateYearAndMonth(dateStr) {
    if (!dateStr) return null;
    const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
        return {
            year: parseInt(match[1], 10),
            month: parseInt(match[2], 10),
            day: parseInt(match[3], 10)
        };
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return {
        year: d.getFullYear(),
        month: d.getMonth() + 1,
        day: d.getDate()
    };
}

function getYearFromDateString(dateStr) {
    const parsed = parseDateYearAndMonth(dateStr);
    return parsed ? parsed.year : null;
}

function getMonthFromDateString(dateStr) {
    const parsed = parseDateYearAndMonth(dateStr);
    return parsed ? parsed.month : null;
}

// --- CORREÇÃO OPERACIONAL E DE MARCOS DE DATA (FUNIL DE COORTE) ---
// Para evitar furos de dados (leads desaparecendo de meses anteriores),
// indexamos todos os marcos do funil à data de criação do lead (data_cad).
function getLeadAcquisitionDate(lead) {
    if (!lead) return null;
    return lead.data_cad;
}

function getLeadStageDate(lead) {
    if (!lead) return null;
    return lead.data_cad;
}

function getLeadDate(lead) {
    if (!lead) return null;
    return lead.data_cad;
}

// --- BUSCA INICIAL DE DADOS ---
async function fetchInitialData() {
    showLoader('Buscando dados no Supabase… Carregando base histórica completa…');
    setSyncStatus('syncing', 'Buscando…');
    
    try {
        const [corretores, imobiliarias, factLeads, slaData, salesData, attributionData] = await Promise.all([
            supabaseFetchAll('dim_corretores', 'idcorretor,nome'),
            supabaseFetchAll('dim_imobiliarias', 'idimobiliaria,nome'),
            supabaseFetchAll('fact_leads', 'idlead,nome,corretor,idcorretor,situacao,idsituacao,imobiliaria,idimobiliaria,origem_nome,origem_ultimo_nome,empreendimento_primeiro,empreendimento_ultimo,data_cad,ultima_data_conversao,reserva,renda_familiar,score,motivo_cancelamento,midia_ultimo,email,telefone,data_ultima_alteracao,data_cancelamento,nome_momento_lead'),
            supabaseFetchAll('view_sla_performance', 'idlead,horas_para_gestor,horas_para_corretor,dias_sem_interacao,corretor,gestor,data_cad'),
            supabaseFetchAll('view_sales_performance', '*'),
            supabaseFetchAll('view_marketing_attribution', 'idlead,midia_original,midia_ultimo,data_cad')
        ]);
        
        let tarefasData = [];
        try {
            tarefasData = await supabaseFetchAll('fact_tarefas', 'idtarefa,idlead,data_cad,situacao,descricao,data_conclusao');
        } catch (err) {
            console.warn('Tabela fact_tarefas não encontrada no Supabase. Mapeamento de visitas usará fallback baseado em situação.', err);
        }
        
        state.data.corretores = corretores.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        state.data.imobiliarias = imobiliarias.sort((a, b) => (a.nome || '').localeCompare(b.nome || ''));
        state.data.leads = factLeads;
        state.data.sla = slaData;
        state.data.sales = salesData;
        state.data.attribution = attributionData;
        state.data.tarefas = tarefasData;
        
        populateFilterDropdowns();
        applyFiltersAndRender();
        
        const countText = `Total: ${Number(factLeads.length).toLocaleString('pt-BR')} leads`;
        setSyncStatus('synced', `Sincronizado • ${countText}`);
        
    } catch (error) {
        console.error('Erro na sincronização:', error);
        
        const hasSaved = localStorage.getItem('db_project_ref') || localStorage.getItem('db_anon_key');
        if (hasSaved) {
            console.warn('Falha de conexão detectada. Limpando cache de credenciais do localStorage...');
            localStorage.removeItem('db_project_ref');
            localStorage.removeItem('db_anon_key');
            loadSettings();
            return fetchInitialData();
        }
        
        setSyncStatus('error', 'Falha ao sincronizar');
        alert(`Falha ao sincronizar dados com o Supabase:\n${error.message || error}`);
    } finally {
        hideLoader();
    }
}

// --- POPULAÇÃO DOS DROPDOWNS FILTROS (SIDEBAR) ---
function populateFilterDropdowns() {
    const imobSelect = document.getElementById('filter-imobiliaria');
    imobSelect.innerHTML = '<option value="all">Todas as Imobiliárias</option>';
    state.data.imobiliarias.forEach(item => {
        if (item.nome) {
            imobSelect.innerHTML += `<option value="${item.idimobiliaria}">${item.nome}</option>`;
        }
    });

    const corretorSelect = document.getElementById('filter-corretor');
    corretorSelect.innerHTML = '<option value="all">Todos os Corretores</option>';
    state.data.corretores.forEach(item => {
        if (item.nome) {
            corretorSelect.innerHTML += `<option value="${item.idcorretor}">${item.nome}</option>`;
        }
    });

    const origem1Select = document.getElementById('filter-origem-primeira');
    origem1Select.innerHTML = '<option value="all">Todas as Origens (1ª)</option>';
    const origens1 = [...new Set(state.data.leads.map(l => l.origem_nome).filter(Boolean))].sort();
    origens1.forEach(item => {
        origem1Select.innerHTML += `<option value="${item}">${item}</option>`;
    });

    const origemUltSelect = document.getElementById('filter-origem-ultima');
    origemUltSelect.innerHTML = '<option value="all">Todas as Origens (Ult)</option>';
    const origensUlt = [...new Set(state.data.leads.map(l => l.origem_ultimo_nome).filter(Boolean))].sort();
    origensUlt.forEach(item => {
        origemUltSelect.innerHTML += `<option value="${item}">${item}</option>`;
    });

    const emp1Select = document.getElementById('filter-emp-primeiro');
    emp1Select.innerHTML = '<option value="all">Todos os Emp. (1º)</option>';
    const emp1 = [...new Set(state.data.leads.map(l => l.empreendimento_primeiro).filter(Boolean))].sort();
    emp1.forEach(item => {
        emp1Select.innerHTML += `<option value="${item}">${item}</option>`;
    });

    const empUltSelect = document.getElementById('filter-emp-ultimo');
    empUltSelect.innerHTML = '<option value="all">Todos os Emp. (Ult)</option>';
    const empUlt = [...new Set(state.data.leads.map(l => l.empreendimento_ultimo).filter(Boolean))].sort();
    empUlt.forEach(item => {
        empUltSelect.innerHTML += `<option value="${item}">${item}</option>`;
    });

    const momentoSelect = document.getElementById('filter-momento');
    momentoSelect.innerHTML = '<option value="all">Todos os momentos</option>';
    const momentos = [...new Set(state.data.leads.map(l => l.nome_momento_lead).filter(Boolean))].sort();
    momentos.forEach(item => {
        momentoSelect.innerHTML += `<option value="${item}">${item}</option>`;
    });

    const anoSelect = document.getElementById('filter-ano');
    anoSelect.innerHTML = '<option value="all">Todos os Anos</option>';
    const anos = [...new Set(state.data.leads.map(lead => {
        const d = getLeadAcquisitionDate(lead);
        return d ? getYearFromDateString(d) : null;
    }).filter(Boolean))].sort((a, b) => b - a);
    
    anos.forEach(ano => {
        anoSelect.innerHTML += `<option value="${ano}">${ano}</option>`;
    });
    
    imobSelect.value = state.filters.imobiliaria;
    corretorSelect.value = state.filters.corretor;
    origem1Select.value = state.filters.origemPrimeira;
    origemUltSelect.value = state.filters.origemUltima;
    emp1Select.value = state.filters.empPrimeiro;
    empUltSelect.value = state.filters.empUltimo;
    momentoSelect.value = state.filters.momento;
    anoSelect.value = state.filters.ano;
    document.getElementById('filter-mes').value = state.filters.mes;
}

// --- FILTRAGEM DE DADOS COMPLETA (CLIENT-SIDE) ---
function applyFiltersAndRender() {
    let filteredLeads = [...state.data.leads];
    
    if (state.filters.imobiliaria !== 'all') {
        filteredLeads = filteredLeads.filter(l => String(l.idimobiliaria) === state.filters.imobiliaria);
    }
    if (state.filters.corretor !== 'all') {
        filteredLeads = filteredLeads.filter(l => String(l.idcorretor) === state.filters.corretor);
    }
    if (state.filters.origemPrimeira !== 'all') {
        filteredLeads = filteredLeads.filter(l => l.origem_nome === state.filters.origemPrimeira);
    }
    if (state.filters.origemUltima !== 'all') {
        filteredLeads = filteredLeads.filter(l => l.origem_ultimo_nome === state.filters.origemUltima);
    }
    if (state.filters.empPrimeiro !== 'all') {
        filteredLeads = filteredLeads.filter(l => l.empreendimento_primeiro === state.filters.empPrimeiro);
    }
    if (state.filters.empUltimo !== 'all') {
        filteredLeads = filteredLeads.filter(l => l.empreendimento_ultimo === state.filters.empUltimo);
    }
    if (state.filters.momento !== 'all') {
        filteredLeads = filteredLeads.filter(l => l.nome_momento_lead === state.filters.momento);
    }
    
    const dashboardBaseLeads = filteredLeads;

    if (state.activeTab === 'comercial') {
        let tableLeads = [...dashboardBaseLeads];
        if (state.filters.stage) {
            const stageKeysMap = {
                'Novo': 'novo',
                'Em Atendimento': 'atendimento',
                'Visita Agendada': 'visitaAgendada',
                'Visita Realizada': 'visitaRealizada',
                'Proposta': 'proposta',
                'Venda Realizada': 'venda'
            };
            const key = stageKeysMap[state.filters.stage];
            const idsValidos = STAGE_IDS[key];
            if (idsValidos && idsValidos.length > 0) {
                tableLeads = tableLeads.filter(l => idsValidos.includes(l.idsituacao));
            }
            
            if (state.filters.ano !== 'all') {
                tableLeads = tableLeads.filter(l => {
                    const d = getLeadAcquisitionDate(l);
                    return d && String(getYearFromDateString(d)) === state.filters.ano;
                });
            }
            if (state.filters.mes !== 'all') {
                tableLeads = tableLeads.filter(l => {
                    const d = getLeadAcquisitionDate(l);
                    return d && String(getMonthFromDateString(d)) === state.filters.mes;
                });
            }
        } else {
            if (state.filters.ano !== 'all') {
                tableLeads = tableLeads.filter(l => {
                    const d = getLeadAcquisitionDate(l);
                    return d && String(getYearFromDateString(d)) === state.filters.ano;
                });
            }
            if (state.filters.mes !== 'all') {
                tableLeads = tableLeads.filter(l => {
                    const d = getLeadAcquisitionDate(l);
                    return d && String(getMonthFromDateString(d)) === state.filters.mes;
                });
            }
        }
        state.table.filteredLeads = tableLeads;
        state.table.currentPage = 1;

        renderKPIs(dashboardBaseLeads);
        renderFunnel(dashboardBaseLeads);
        renderLeadsTable();
        renderLeaderboard(dashboardBaseLeads);
        renderSLAMetrics(dashboardBaseLeads);
        renderMarketingAttribution(dashboardBaseLeads);
    } 
    else if (state.activeTab === 'diretoria') {
        renderDirectorsView(dashboardBaseLeads);
    } 
    else if (state.activeTab === 'coordenadores') {
        renderCoordinatorsView(dashboardBaseLeads);
    } 
    else if (state.activeTab === 'saude-crm') {
        renderCRMHealthView(dashboardBaseLeads);
    }

    updateActiveFiltersSummary();
    recreateLucideIcons();
}

// --- BARRA DE RESUMO DE FILTROS ATIVOS E BADGES (SIDEBAR) ---
function updateActiveFiltersSummary() {
    const summaryContainer = document.getElementById('active-filters-summary');
    if (!summaryContainer) return;

    const filterConfigs = [
        { id: 'filter-imobiliaria', key: 'imobiliaria', label: 'Imobiliária', cat: 'atribuicao' },
        { id: 'filter-corretor', key: 'corretor', label: 'Corretor', cat: 'atribuicao' },
        { id: 'filter-origem-primeira', key: 'origemPrimeira', label: 'Origem 1ª', cat: 'jornada' },
        { id: 'filter-origem-ultima', key: 'origemUltima', label: 'Origem Ult', cat: 'jornada' },
        { id: 'filter-emp-primeiro', key: 'empPrimeiro', label: 'Emp. 1º', cat: 'jornada' },
        { id: 'filter-emp-ultimo', key: 'empUltimo', label: 'Emp. Ult', cat: 'jornada' },
        { id: 'filter-momento', key: 'momento', label: 'Momento', cat: 'jornada' },
        { id: 'filter-ano', key: 'ano', label: 'Ano', cat: 'periodo' },
        { id: 'filter-mes', key: 'mes', label: 'Mês', cat: 'periodo' }
    ];

    let totalActive = 0;
    const catCounts = { atribuicao: 0, jornada: 0, periodo: 0 };
    const activePills = [];

    filterConfigs.forEach(cfg => {
        const select = document.getElementById(cfg.id);
        if (!select) return;
        
        const value = state.filters[cfg.key];

        if (value !== 'all' && value !== null && value !== undefined) {
            totalActive++;
            catCounts[cfg.cat]++;
            select.classList.add('active-filter');

            const selectedText = select.options[select.selectedIndex]?.text || value;
            activePills.push({
                key: cfg.key,
                id: cfg.id,
                displayText: `${cfg.label}: ${selectedText}`
            });
        } else {
            select.classList.remove('active-filter');
        }
    });

    const updateCategoryIndicator = (catId, count, clearBtnId) => {
        const catElement = document.getElementById(`cat-${catId}`);
        const badge = document.getElementById(`badge-${catId}`);
        const clearBtn = document.getElementById(clearBtnId);
        
        if (catElement) {
            if (count > 0) catElement.classList.add('has-active-filters');
            else catElement.classList.remove('has-active-filters');
        }
        
        if (badge) {
            if (count > 0) {
                badge.innerText = count;
                badge.style.display = 'inline-block';
                if (clearBtn) clearBtn.style.display = 'inline-block';
            } else {
                badge.style.display = 'none';
                if (clearBtn) clearBtn.style.display = 'none';
            }
        }
    };

    updateCategoryIndicator('atribuicao', catCounts.atribuicao, 'clear-cat-atribuicao');
    updateCategoryIndicator('jornada', catCounts.jornada, 'clear-cat-jornada');
    updateCategoryIndicator('periodo', catCounts.periodo, 'clear-cat-periodo');

    if (totalActive > 0) {
        summaryContainer.style.display = 'flex';
        
        let pillsHTML = activePills.map(pill => {
            return `
                <span class="active-filter-pill">
                    ${pill.displayText}
                    <i data-lucide="x" class="filter-remove-icon" data-key="${pill.key}" data-id="${pill.id}" title="Remover filtro"></i>
                </span>
            `;
        }).join('');

        summaryContainer.innerHTML = `
            <div class="active-filters-header">
                <span class="active-filters-title">Filtros Ativos (${totalActive})</span>
                <button class="clear-all-filters-btn" id="btn-clear-all-filters">Limpar Todos</button>
            </div>
            <div class="active-filters-pills-row">
                ${pillsHTML}
            </div>
        `;

        summaryContainer.querySelectorAll('.filter-remove-icon').forEach(icon => {
            icon.addEventListener('click', (e) => {
                const key = e.target.getAttribute('data-key');
                const id = e.target.getAttribute('data-id');
                state.filters[key] = 'all';
                const select = document.getElementById(id);
                if (select) select.value = 'all';
                applyFiltersAndRender();
            });
        });

        document.getElementById('btn-clear-all-filters').addEventListener('click', () => {
            filterConfigs.forEach(cfg => {
                state.filters[cfg.key] = 'all';
                const select = document.getElementById(cfg.id);
                if (select) select.value = 'all';
            });
            applyFiltersAndRender();
        });
    } else {
        summaryContainer.style.display = 'none';
        summaryContainer.innerHTML = '';
    }
}

// =========================================================================
// ==================== RENDERS DA ABA 1: FUNIL COMERCIAL ==================
// =========================================================================
function calculatePeriodComparisons(leads) {
    let refYear = null;
    let refMonth = null;
    
    if (state.filters.ano !== 'all') {
        refYear = parseInt(state.filters.ano);
    }
    if (state.filters.mes !== 'all') {
        refMonth = parseInt(state.filters.mes);
    }
    
    if (!refYear || !refMonth) {
        const validLeads = leads.filter(l => getLeadDate(l));
        if (validLeads.length > 0) {
            let maxTime = 0;
            let latestLead = null;
            validLeads.forEach(l => {
                const t = new Date(getLeadDate(l)).getTime();
                if (t > maxTime) {
                    maxTime = t;
                    latestLead = l;
                }
            });
            if (latestLead) {
                const d = getLeadDate(latestLead);
                if (d) {
                    if (!refYear) refYear = getYearFromDateString(d);
                    if (!refMonth) refMonth = getMonthFromDateString(d);
                }
            }
        }
    }
    
    if (!refYear || !refMonth) {
        return {
            hasData: false,
            prevMonthName: '',
            prevYear: 0,
            metrics: {
                total: { current: 0, prev: 0, html: '--' },
                agendadas: { current: 0, prev: 0, html: '--' },
                realizadas: { current: 0, prev: 0, html: '--' },
                vendas: { current: 0, prev: 0, html: '--' },
                conversao: { current: 0, prev: 0, html: '--' },
                renda: { current: 0, prev: 0, html: '--' },
                atendimento: { current: 0, prev: 0, html: '--' },
                reatribuicao: { current: 0, prev: 0, html: '--' },
                corretores: { current: 0, prev: 0, html: '--' },
                mediaLeads: { current: 0, prev: 0, html: '--' },
                ganhos: { current: 0, prev: 0, html: '--' },
                semCorretor: { current: 0, prev: 0, html: '--' },
                incompleto: { current: 0, prev: 0, html: '--' },
                leadScore: { current: 0, prev: 0, html: '--' },
                saude: { current: 0, prev: 0, html: '--' }
            }
        };
    }
    
    const prevYear = refMonth === 1 ? refYear - 1 : refYear;
    const prevMonth = refMonth === 1 ? 12 : refMonth - 1;
    
    const monthNames = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
    const prevMonthName = monthNames[prevMonth - 1];
    
    const filterByDimensions = (leadsList) => {
        let list = [...leadsList];
        if (state.filters.imobiliaria !== 'all') {
            list = list.filter(l => String(l.idimobiliaria) === state.filters.imobiliaria);
        }
        if (state.filters.corretor !== 'all') {
            list = list.filter(l => String(l.idcorretor) === state.filters.corretor);
        }
        if (state.filters.origemPrimeira !== 'all') {
            list = list.filter(l => l.origem_nome === state.filters.origemPrimeira);
        }
        if (state.filters.origemUltima !== 'all') {
            list = list.filter(l => l.origem_ultimo_nome === state.filters.origemUltima);
        }
        if (state.filters.empPrimeiro !== 'all') {
            list = list.filter(l => l.empreendimento_primeiro === state.filters.empPrimeiro);
        }
        if (state.filters.empUltimo !== 'all') {
            list = list.filter(l => l.empreendimento_ultimo === state.filters.empUltimo);
        }
        return list;
    };
    
    const baseList = filterByDimensions(state.data.leads);
    
    const currentLeadsAcquisition = baseList.filter(l => {
        const dateStr = getLeadAcquisitionDate(l);
        return dateStr && getYearFromDateString(dateStr) === refYear && getMonthFromDateString(dateStr) === refMonth;
    });
    
    const prevLeadsAcquisition = baseList.filter(l => {
        const dateStr = getLeadAcquisitionDate(l);
        return dateStr && getYearFromDateString(dateStr) === prevYear && getMonthFromDateString(dateStr) === prevMonth;
    });

    const currentLeadsStage = currentLeadsAcquisition; // Cohort
    const prevLeadsStage = prevLeadsAcquisition;       // Cohort
    
    const formatMoMTrend = (currVal, prevVal, isPercentage = false, isInverse = false) => {
        let pct = 0;
        if (prevVal === 0) {
            pct = currVal > 0 ? 100 : 0;
        } else {
            pct = ((currVal - prevVal) / prevVal) * 100;
        }
        let displayTrend = '';
        let trendClass = 'neutral';
        let arrowIcon = 'minus';
        
        const isPositiveChange = pct > 0;
        const isNegativeChange = pct < 0;
        
        if (isPositiveChange) {
            trendClass = isInverse ? 'negative' : 'positive';
            arrowIcon = 'trending-up';
            displayTrend = `+${pct.toFixed(1)}%`;
        } else if (isNegativeChange) {
            trendClass = isInverse ? 'positive' : 'negative';
            arrowIcon = 'trending-down';
            displayTrend = `${pct.toFixed(1)}%`;
        } else {
            trendClass = 'neutral';
            arrowIcon = 'minus';
            displayTrend = '0.0%';
        }
        
        return `<span class="${trendClass}"><i data-lucide="${arrowIcon}"></i>\u00A0${displayTrend}</span> vs.\u00A0${prevMonthName}\u00A0de\u00A0${prevYear}`;
    };
    
    const cTotal = currentLeadsAcquisition.length;
    const pTotal = prevLeadsAcquisition.length;
    
    let cAgend = 0;
    let pAgend = 0;
    let cReal = 0;
    let pReal = 0;
    
    if (state.data.tarefas && state.data.tarefas.length > 0) {
        const baseLeadIds = new Set(baseList.map(l => l.idlead));
        const filteredTarefas = state.data.tarefas.filter(t => baseLeadIds.has(t.idlead));
        
        const currentTarefas = filteredTarefas.filter(t => {
            const dateStr = t.data_conclusao || t.data_cad || t.data;
            return dateStr && getYearFromDateString(dateStr) === refYear && getMonthFromDateString(dateStr) === refMonth;
        });
        
        const prevTarefas = filteredTarefas.filter(t => {
            const dateStr = t.data_conclusao || t.data_cad || t.data;
            return dateStr && getYearFromDateString(dateStr) === prevYear && getMonthFromDateString(dateStr) === prevMonth;
        });
        
        const cVisitasTasks = currentTarefas.filter(t => (t.descricao || '').toUpperCase().includes('VISITA'));
        cAgend = new Set(cVisitasTasks.map(t => t.idlead)).size;
        cReal = new Set(cVisitasTasks.filter(t => t.situacao === 'C' || t.data_conclusao).map(t => t.idlead)).size;
        
        const pVisitasTasks = prevTarefas.filter(t => (t.descricao || '').toUpperCase().includes('VISITA'));
        pAgend = new Set(pVisitasTasks.map(t => t.idlead)).size;
        pReal = new Set(pVisitasTasks.filter(t => t.situacao === 'C' || t.data_conclusao).map(t => t.idlead)).size;
    } else {
        cAgend = currentLeadsStage.filter(l => STAGE_IDS.visitaAgendada.includes(l.idsituacao)).length;
        pAgend = prevLeadsStage.filter(l => STAGE_IDS.visitaAgendada.includes(l.idsituacao)).length;
        cReal = currentLeadsStage.filter(l => STAGE_IDS.visitaRealizada.includes(l.idsituacao)).length;
        pReal = prevLeadsStage.filter(l => STAGE_IDS.visitaRealizada.includes(l.idsituacao)).length;
    }
    
    const cVendas = currentLeadsStage.filter(l => l.reserva === 1 || STAGE_IDS.venda.includes(l.idsituacao)).length;
    const pVendas = prevLeadsStage.filter(l => l.reserva === 1 || STAGE_IDS.venda.includes(l.idsituacao)).length;
    
    const cConv = cTotal > 0 ? (cVendas / cTotal) * 100 : 0;
    const pConv = pTotal > 0 ? (pVendas / pTotal) * 100 : 0;
    
    const cLeadsComRenda = currentLeadsAcquisition.filter(l => l.renda_familiar !== null && l.renda_familiar > 0);
    const cRenda = cLeadsComRenda.length > 0 ? cLeadsComRenda.reduce((acc, curr) => acc + curr.renda_familiar, 0) / cLeadsComRenda.length : 0;
    const pLeadsComRenda = prevLeadsAcquisition.filter(l => l.renda_familiar !== null && l.renda_familiar > 0);
    const pRenda = pLeadsComRenda.length > 0 ? pLeadsComRenda.reduce((acc, curr) => acc + curr.renda_familiar, 0) / pLeadsComRenda.length : 0;
    
    const cAtend = currentLeadsStage.filter(l => l.idsituacao && STAGE_IDS.atendimento.includes(l.idsituacao)).length;
    const pAtend = prevLeadsStage.filter(l => l.idsituacao && STAGE_IDS.atendimento.includes(l.idsituacao)).length;
    
    const slaMap = new Map((state.data.sla || []).map(s => [s.idlead, s.dias_sem_interacao]));

    const cReatrib = currentLeadsAcquisition.filter(l => {
        const dias = slaMap.get(l.idlead);
        return dias !== undefined && dias !== null && dias > 7 && STAGE_IDS.atendimento.includes(l.idsituacao);
    }).length;
    const pReatrib = prevLeadsAcquisition.filter(l => {
        const dias = slaMap.get(l.idlead);
        return dias !== undefined && dias !== null && dias > 7 && STAGE_IDS.atendimento.includes(l.idsituacao);
    }).length;
    
    const cCorr = [...new Set(currentLeadsAcquisition.map(l => l.idcorretor).filter(Boolean))].length;
    const pCorr = [...new Set(prevLeadsAcquisition.map(l => l.idcorretor).filter(Boolean))].length;
    
    const cMediaLeads = cCorr > 0 ? cTotal / cCorr : 0;
    const pMediaLeads = pCorr > 0 ? pTotal / pCorr : 0;
    
    const cSemCorr = currentLeadsAcquisition.filter(l => l.idcorretor === null || l.idcorretor === 0 || String(l.idcorretor).trim() === '').length;
    const pSemCorr = prevLeadsAcquisition.filter(l => l.idcorretor === null || l.idcorretor === 0 || String(l.idcorretor).trim() === '').length;
    
    const cIncompCount = currentLeadsAcquisition.filter(l => !l.email && !l.telefone).length;
    const cIncompPct = cTotal > 0 ? (cIncompCount / cTotal) * 100 : 0;
    const pIncompCount = prevLeadsAcquisition.filter(l => !l.email && !l.telefone).length;
    const pIncompPct = pTotal > 0 ? (pIncompCount / pTotal) * 100 : 0;
    
    const cLeadsComScore = currentLeadsAcquisition.filter(l => l.score !== null && l.score > 0);
    const cScore = cLeadsComScore.length > 0 ? cLeadsComScore.reduce((acc, curr) => acc + curr.score, 0) / cLeadsComScore.length : 0;
    const pLeadsComScore = prevLeadsAcquisition.filter(l => l.score !== null && l.score > 0);
    const pScore = pLeadsComScore.length > 0 ? pLeadsComScore.reduce((acc, curr) => acc + curr.score, 0) / pLeadsComScore.length : 0;
    
    const getQualityIndex = (list) => {
        if (!list.length) return 0;
        const total = list.length;
        const semCorr = list.filter(l => !l.idcorretor || l.corretor === 'Não Atribuído').length;
        const incomp = list.filter(l => {
            const semEmail = !l.email || l.email.trim() === '';
            const semFone = !l.telefone || l.telefone.trim() === '';
            return semEmail && semFone;
        }).length;
        const comEmp = list.filter(l => l.empreendimento_ultimo && l.empreendimento_ultimo !== 'Desconhecido').length;
        const comCorr = total - semCorr;
        const comCont = total - incomp;
        return (((comEmp / total) + (comCorr / total) + (comCont / total)) / 3) * 100;
    };
    const cQualPct = getQualityIndex(currentLeadsAcquisition);
    const pQualPct = getQualityIndex(prevLeadsAcquisition);

    return {
        hasData: true,
        prevMonthName,
        prevYear,
        metrics: {
            total: { current: cTotal, prev: pTotal, html: formatMoMTrend(cTotal, pTotal) },
            agendadas: { current: cAgend, prev: pAgend, html: formatMoMTrend(cAgend, pAgend) },
            realizadas: { current: cReal, prev: pReal, html: formatMoMTrend(cReal, pReal) },
            vendas: { current: cVendas, prev: pVendas, html: formatMoMTrend(cVendas, pVendas) },
            conversao: { current: cConv, prev: pConv, html: formatMoMTrend(cConv, pConv) },
            renda: { current: cRenda, prev: pRenda, html: formatMoMTrend(cRenda, pRenda) },
            atendimento: { current: cAtend, prev: pAtend, html: formatMoMTrend(cAtend, pAtend) },
            reatribuicao: { current: cReatrib, prev: pReatrib, html: formatMoMTrend(cReatrib, pReatrib, false, true) },
            corretores: { current: cCorr, prev: pCorr, html: formatMoMTrend(cCorr, pCorr) },
            mediaLeads: { current: cMediaLeads, prev: pMediaLeads, html: formatMoMTrend(cMediaLeads, pMediaLeads) },
            ganhos: { current: cVendas, prev: pVendas, html: formatMoMTrend(cVendas, pVendas) },
            semCorretor: { current: cSemCorr, prev: pSemCorr, html: formatMoMTrend(cSemCorr, pSemCorr, false, true) },
            incompleto: { current: cIncompPct, prev: pIncompPct, html: formatMoMTrend(cIncompPct, pIncompPct, true, true) },
            leadScore: { current: cScore, prev: pScore, html: formatMoMTrend(cScore, pScore) },
            saude: { current: cQualPct, prev: pQualPct, html: formatMoMTrend(cQualPct, pQualPct, true) }
        }
    };
}

function renderKPIs(leads) {
    let leadsAcquisition = [...leads];
    
    if (state.filters.ano !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getYearFromDateString(d)) === state.filters.ano;
        });
    }
    if (state.filters.mes !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getMonthFromDateString(d)) === state.filters.mes;
        });
    }
    
    const leadsStage = leadsAcquisition; // Cohort
    const totalLeads = leadsAcquisition.length;
    const vendas = leadsStage.filter(l => l.reserva === 1 || STAGE_IDS.venda.includes(l.idsituacao)).length;
    const atendimentoAtivo = leadsStage.filter(l => l.idsituacao && STAGE_IDS.atendimento.includes(l.idsituacao)).length;
    
    let visitasAgendadas = 0;
    let visitasRealizadas = 0;
    
    if (state.data.tarefas && state.data.tarefas.length > 0) {
        const activeLeadIds = new Set(leads.map(l => l.idlead));
        let filteredTarefas = state.data.tarefas.filter(t => activeLeadIds.has(t.idlead));
        
        if (state.filters.ano !== 'all') {
            filteredTarefas = filteredTarefas.filter(t => {
                const dateStr = t.data_conclusao || t.data_cad || t.data;
                return dateStr && String(getYearFromDateString(dateStr)) === state.filters.ano;
            });
        }
        if (state.filters.mes !== 'all') {
            filteredTarefas = filteredTarefas.filter(t => {
                const dateStr = t.data_conclusao || t.data_cad || t.data;
                return dateStr && String(getMonthFromDateString(dateStr)) === state.filters.mes;
            });
        }
        
        const tarefasVisitas = filteredTarefas.filter(t => (t.descricao || '').toUpperCase().includes('VISITA'));
        visitasAgendadas = new Set(tarefasVisitas.map(t => t.idlead)).size;
        visitasRealizadas = new Set(tarefasVisitas.filter(t => t.situacao === 'C' || t.data_conclusao).map(t => t.idlead)).size;
    } else {
        visitasAgendadas = leadsStage.filter(l => STAGE_IDS.visitaAgendada.includes(l.idsituacao)).length;
        visitasRealizadas = leadsStage.filter(l => STAGE_IDS.visitaRealizada.includes(l.idsituacao)).length;
    }
    
    const txAgendamento = totalLeads > 0 ? ((visitasAgendadas / totalLeads) * 100).toFixed(1) : '0.0';
    const txPresenca = visitasAgendadas > 0 ? ((visitasRealizadas / visitasAgendadas) * 100).toFixed(1) : '0.0';
    const txConversao = totalLeads > 0 ? ((vendas / totalLeads) * 100).toFixed(1) : '0.0';

    const formattedTotalLeads = Number(totalLeads).toLocaleString('pt-BR');
    const formattedVisitasAgendadas = Number(visitasAgendadas).toLocaleString('pt-BR');
    const formattedVisitasRealizadas = Number(visitasRealizadas).toLocaleString('pt-BR');
    const formattedVendas = Number(vendas).toLocaleString('pt-BR');

    document.getElementById('kpi-total').innerText = formattedTotalLeads;
    document.getElementById('kpi-total-footer').innerHTML = `<i data-lucide="circle"></i> Sendo\u00A0<span>${Number(atendimentoAtivo).toLocaleString('pt-BR')}</span>\u00A0em atendimento ativo`;

    document.getElementById('kpi-visitas-agendadas').innerText = formattedVisitasAgendadas;
    document.getElementById('kpi-agendadas-footer').innerHTML = `<i data-lucide="circle"></i> <span>${txAgendamento}%\u00A0</span>taxa de agendamento`;

    document.getElementById('kpi-visitas-realizadas').innerText = formattedVisitasRealizadas;
    document.getElementById('kpi-realizadas-footer').innerHTML = `<i data-lucide="circle"></i> <span>${txPresenca}%\u00A0</span>de comparecimento`;

    document.getElementById('kpi-vendas').innerText = formattedVendas;
    document.getElementById('kpi-vendas-footer').innerHTML = `<i data-lucide="wallet"></i> <span>${txConversao}%\u00A0</span>conversão geral`;

    const comp = calculatePeriodComparisons(leads);
    document.getElementById('kpi-total-trend').innerHTML = comp.metrics.total.html;
    document.getElementById('kpi-agendadas-trend').innerHTML = comp.metrics.agendadas.html;
    document.getElementById('kpi-realizadas-trend').innerHTML = comp.metrics.realizadas.html;
    document.getElementById('kpi-vendas-trend').innerHTML = comp.metrics.vendas.html;
}

function renderFunnel(leads) {
    let leadsAcquisition = [...leads];
    
    if (state.filters.ano !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getYearFromDateString(d)) === state.filters.ano;
        });
    }
    if (state.filters.mes !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getMonthFromDateString(d)) === state.filters.mes;
        });
    }

    const leadsStage = leadsAcquisition; // Cohort
    const countNovo = leadsAcquisition.length;
    const countAtendimento = leadsAcquisition.filter(l => STAGE_IDS.atendimento.includes(l.idsituacao)).length;
    
    let countAgendada = 0;
    let countRealizada = 0;
    
    if (state.data.tarefas && state.data.tarefas.length > 0) {
        const activeLeadIds = new Set(leadsStage.map(l => l.idlead));
        let filteredTarefas = state.data.tarefas.filter(t => activeLeadIds.has(t.idlead));
        
        if (state.filters.ano !== 'all') {
            filteredTarefas = filteredTarefas.filter(t => {
                const dateStr = t.data_conclusao || t.data_cad || t.data;
                return dateStr && String(getYearFromDateString(dateStr)) === state.filters.ano;
            });
        }
        if (state.filters.mes !== 'all') {
            filteredTarefas = filteredTarefas.filter(t => {
                const dateStr = t.data_conclusao || t.data_cad || t.data;
                return dateStr && String(getMonthFromDateString(dateStr)) === state.filters.mes;
            });
        }
        
        const tarefasVisitas = filteredTarefas.filter(t => (t.descricao || '').toUpperCase().includes('VISITA'));
        countAgendada = new Set(tarefasVisitas.map(t => t.idlead)).size;
        countRealizada = new Set(tarefasVisitas.filter(t => t.situacao === 'C' || t.data_conclusao).map(t => t.idlead)).size;
    } else {
        countAgendada = leadsStage.filter(l => STAGE_IDS.visitaAgendada.includes(l.idsituacao)).length;
        countRealizada = leadsStage.filter(l => STAGE_IDS.visitaRealizada.includes(l.idsituacao)).length;
    }
    
    const countProposta = leadsStage.filter(l => STAGE_IDS.proposta.includes(l.idsituacao)).length;
    const countVenda = leadsStage.filter(l => l.reserva === 1 || STAGE_IDS.venda.includes(l.idsituacao)).length;

    const pctAtendVal = countNovo > 0 ? (countAtendimento / countNovo) * 100 : 0;
    const pctAgendVal = countAtendimento > 0 ? (countAgendada / countAtendimento) * 100 : 0;
    const pctRealizVal = countAgendada > 0 ? (countRealizada / countAgendada) * 100 : 0;
    const pctPropVal = countRealizada > 0 ? (countProposta / countRealizada) * 100 : 0;
    const pctVendaVal = countProposta > 0 ? (countVenda / countProposta) * 100 : 0;

    const pctAtendTotalVal = countNovo > 0 ? (countAtendimento / countNovo) * 100 : 0;
    const pctAgendTotalVal = countNovo > 0 ? (countAgendada / countNovo) * 100 : 0;
    const pctRealizTotalVal = countNovo > 0 ? (countRealizada / countNovo) * 100 : 0;
    const pctPropTotalVal = countNovo > 0 ? (countProposta / countNovo) * 100 : 0;
    const pctVendaTotalVal = countNovo > 0 ? (countVenda / countNovo) * 100 : 0;

    const pctNovo = '100%';
    const pctAtend = `${pctAtendVal.toFixed(1)}% (${pctAtendTotalVal.toFixed(1)}% total)`;
    const pctAgend = `${pctAgendVal.toFixed(1)}% (${pctAgendTotalVal.toFixed(1)}% total)`;
    const pctRealiz = `${pctRealizVal.toFixed(1)}% (${pctRealizTotalVal.toFixed(1)}% total)`;
    const pctProp = `${pctPropVal.toFixed(1)}% (${pctPropTotalVal.toFixed(1)}% total)`;
    const pctVenda = `${pctVendaVal.toFixed(1)}% (${pctVendaTotalVal.toFixed(1)}% total)`;

    const maxCount = Math.max(countNovo, countAtendimento, countAgendada, countRealizada, countProposta, countVenda, 1);

    updateStageBar('novo', countNovo, maxCount, pctNovo);
    updateStageBar('atendimento', countAtendimento, maxCount, pctAtend);
    updateStageBar('visita-agendada', countAgendada, maxCount, pctAgend);
    updateStageBar('visita-realizada', countRealizada, maxCount, pctRealiz);
    updateStageBar('proposta', countProposta, maxCount, pctProp);
    updateStageBar('venda', countVenda, maxCount, pctVenda);
}

function updateStageBar(elementId, stageCount, total, conversionText) {
    const outerEl = document.getElementById(`funnel-stage-${elementId}`);
    const innerEl = outerEl.querySelector('.funnel-bar-inner');
    const badgeEl = document.getElementById(`conversion-stage-${elementId}`);
    
    const percentWidth = total > 0 ? (stageCount / total) * 100 : 0;
    innerEl.style.width = `${percentWidth}%`;
    innerEl.innerText = Number(stageCount).toLocaleString('pt-BR');
    badgeEl.innerText = conversionText;
    
    const stateStageMap = {
        'novo': 'Novo',
        'atendimento': 'Em Atendimento',
        'visita-agendada': 'Visita Agendada',
        'visita-realizada': 'Visita Realizada',
        'proposta': 'Proposta',
        'venda': 'Venda Realizada'
    };
    
    if (state.filters.stage === stateStageMap[elementId]) {
        outerEl.classList.add('active');
    } else {
        outerEl.classList.remove('active');
    }
}

function renderLeadsTable() {
    const listBody = document.getElementById('leads-table-body');
    const countBadge = document.getElementById('leads-count-badge');
    const titleEl = document.getElementById('table-title');
    
    const leads = state.table.filteredLeads;
    countBadge.innerText = `${Number(leads.length).toLocaleString('pt-BR')}\u00A0Leads`;
    
    if (state.filters.stage) {
        titleEl.innerHTML = `Leads na Etapa: <span style="color: var(--accent-orange);">${state.filters.stage}</span>`;
    } else {
        titleEl.innerText = `Lista Analítica de Leads`;
    }
    
    if (leads.length === 0) {
        listBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-muted); padding: 2rem;">Nenhum lead encontrado para os filtros selecionados.</td>
            </tr>
        `;
        document.getElementById('page-indicator').innerText = 'Página 0 de 0';
        document.getElementById('btn-prev-page').disabled = true;
        document.getElementById('btn-next-page').disabled = true;
        return;
    }
    
    const totalPages = Math.ceil(leads.length / state.table.pageSize);
    if (state.table.currentPage > totalPages) state.table.currentPage = totalPages;
    const startIndex = (state.table.currentPage - 1) * state.table.pageSize;
    const endIndex = Math.min(startIndex + state.table.pageSize, leads.length);
    const paginatedLeads = leads.slice(startIndex, endIndex);
    
    document.getElementById('page-indicator').innerText = `Página ${state.table.currentPage} de ${totalPages}`;
    document.getElementById('btn-prev-page').disabled = state.table.currentPage === 1;
    document.getElementById('btn-next-page').disabled = state.table.currentPage === totalPages;
    
    listBody.innerHTML = '';
    paginatedLeads.forEach(lead => {
        let badgeClass = 'novo';
        if (STAGE_IDS.venda.includes(lead.idsituacao)) badgeClass = 'venda';
        else if (STAGE_IDS.proposta.includes(lead.idsituacao)) badgeClass = 'proposta';
        else if (STAGE_IDS.visitaRealizada.includes(lead.idsituacao) || STAGE_IDS.visitaAgendada.includes(lead.idsituacao)) badgeClass = 'visita';
        else if (STAGE_IDS.atendimento.includes(lead.idsituacao)) badgeClass = 'atendimento';
        
        listBody.innerHTML += `
            <tr>
                <td><strong>#${lead.idlead}</strong></td>
                <td>${lead.nome || 'Cliente sem Nome'}</td>
                <td>${lead.corretor || 'Não Atribuído'}</td>
                <td><span class="badge-situation ${badgeClass}">${lead.situacao || 'Indefinida'}</span></td>
            </tr>
        `;
    });
}

function renderLeaderboard(leads) {
    const listContainer = document.getElementById('brokers-leaderboard');
    const brokerStats = {};
    
    let leadsAcquisition = [...leads];
    
    if (state.filters.ano !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getYearFromDateString(d)) === state.filters.ano;
        });
    }
    if (state.filters.mes !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getMonthFromDateString(d)) === state.filters.mes;
        });
    }
    
    leadsAcquisition.forEach(lead => {
        if (!lead.idcorretor) return;
        const brokerName = lead.corretor || `Corretor ${lead.idcorretor}`;
        if (!brokerStats[lead.idcorretor]) {
            brokerStats[lead.idcorretor] = {
                id: lead.idcorretor,
                nome: brokerName,
                imobiliaria: lead.imobiliaria || 'Sem Imobiliária',
                atendidos: 0,
                vendas: 0
            };
        }
        brokerStats[lead.idcorretor].atendidos += 1;
        if (lead.reserva === 1 || STAGE_IDS.venda.includes(lead.idsituacao)) {
            brokerStats[lead.idcorretor].vendas += 1;
        }
    });
    
    const brokersList = Object.values(brokerStats)
        .sort((a, b) => b.vendas - a.vendas || b.atendidos - a.atendidos)
        .slice(0, 5);
        
    if (brokersList.length === 0) {
        listContainer.innerHTML = '<p style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Nenhuma venda registrada para os filtros ativos.</p>';
        return;
    }
    
    listContainer.innerHTML = '';
    brokersList.forEach((broker, index) => {
        const txConv = broker.atendidos > 0 ? ((broker.vendas / broker.atendidos) * 100).toFixed(1) : '0.0';
        const iniciais = broker.nome.split(' ').map(n => n[0]).slice(0, 2).join('').toUpperCase();
        
        const gradientStyles = [
            'var(--accent-purple-gradient)',
            'var(--accent-blue-gradient)',
            'var(--accent-green-gradient)',
            'var(--accent-orange-gradient)',
            'linear-gradient(135deg, var(--red-500), var(--red-600))'
        ];
        
        listContainer.innerHTML += `
            <div class="broker-item">
                <div class="broker-info">
                    <div class="broker-avatar" style="background: ${gradientStyles[index % 5]}">${iniciais}</div>
                    <div class="broker-meta">
                        <h4>${broker.nome}</h4>
                        <p>${broker.imobiliaria}</p>
                    </div>
                </div>
                <div class="broker-stats">
                    <div class="broker-leads">${broker.vendas}\u00A0Venda(s)</div>
                    <div class="broker-conversion">${txConv}%\u00A0Conversão</div>
                </div>
            </div>
        `;
    });
}

function renderSLAMetrics(leads) {
    let leadsAcquisition = [...leads];
    if (state.filters.ano !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getYearFromDateString(d)) === state.filters.ano;
        });
    }
    if (state.filters.mes !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getMonthFromDateString(d)) === state.filters.mes;
        });
    }
    
    const activeLeadIds = new Set(leadsAcquisition.map(l => l.idlead));
    const slaFiltered = state.data.sla.filter(s => activeLeadIds.has(s.idlead));
    
    const gestorSLAs = [];
    const corretorSLAs = [];
    let leadsSemInteracaoCriticos = 0;
    
    slaFiltered.forEach(s => {
        if (s.horas_para_gestor !== null && s.horas_para_gestor >= 0) {
            gestorSLAs.push(s.horas_para_gestor);
        }
        if (s.horas_para_corretor !== null && s.horas_para_corretor >= 0) {
            corretorSLAs.push(s.horas_para_corretor);
        }
        if (s.dias_sem_interacao !== null && s.dias_sem_interacao > 7) {
            leadsSemInteracaoCriticos++;
        }
    });
    
    const medianGestor = gestorSLAs.length > 0 ? calculateMedian(gestorSLAs).toFixed(1) : '0.0';
    const medianCorretor = corretorSLAs.length > 0 ? calculateMedian(corretorSLAs).toFixed(1) : '0.0';
    
    document.getElementById('sla-corretor-val').innerText = `${medianCorretor}h`;
    document.getElementById('sla-gestor-val').innerText = `${medianGestor}h`;
    
    const alertBanner = document.getElementById('sla-alarm-banner');
    const alertDesc = document.getElementById('sla-alert-description');
    
    if (leadsSemInteracaoCriticos > 0) {
        alertBanner.style.background = 'rgba(239, 68, 68, 0.05)';
        alertBanner.style.borderColor = 'rgba(239, 68, 68, 0.3)';
        alertBanner.querySelector('.sla-alert-icon').style.color = 'var(--accent-red)';
        alertDesc.innerHTML = `Existem <strong style="color: var(--accent-red);">${leadsSemInteracaoCriticos} leads ativos</strong> sem nenhuma interação há mais de 7 dias úteis!`;
    } else {
        alertBanner.style.background = 'rgba(16, 185, 129, 0.05)';
        alertBanner.style.borderColor = 'rgba(16, 185, 129, 0.25)';
        alertBanner.querySelector('.sla-alert-icon').style.color = 'var(--accent-green)';
        alertDesc.innerText = 'Operação saudável. Todos os leads ativos foram contatados nos últimos 7 dias!';
    }
}

function renderMarketingAttribution(leads) {
    let leadsAcquisition = [...leads];
    if (state.filters.ano !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getYearFromDateString(d)) === state.filters.ano;
        });
    }
    if (state.filters.mes !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getMonthFromDateString(d)) === state.filters.mes;
        });
    }
    const activeLeadIds = new Set(leadsAcquisition.map(l => l.idlead));
    const attrFiltered = state.data.attribution.filter(a => activeLeadIds.has(a.idlead));
    
    const midiasOriginais = {};
    const midiasUltimas = {};
    
    attrFiltered.forEach(a => {
        const mo = a.midia_original || 'Orgânico / Desconhecido';
        const mu = a.midia_ultimo || 'Orgânico / Desconhecido';
        midiasOriginais[mo] = (midiasOriginais[mo] || 0) + 1;
        midiasUltimas[mu] = (midiasUltimas[mu] || 0) + 1;
    });
    
    const allMedias = [...new Set([...Object.keys(midiasOriginais), ...Object.keys(midiasUltimas)])];
    const sortedMedias = allMedias.sort((a, b) => {
        const countA = (midiasOriginais[a] || 0) + (midiasUltimas[a] || 0);
        const countB = (midiasOriginais[b] || 0) + (midiasUltimas[b] || 0);
        return countB - countA;
    }).slice(0, 6);
    
    const datasets = {
        labels: sortedMedias,
        original: sortedMedias.map(m => midiasOriginais[m] || 0),
        ultimo: sortedMedias.map(m => midiasUltimas[m] || 0)
    };
    
    if (state.charts.marketing) {
        state.charts.marketing.destroy();
    }
    
    const ctx = document.getElementById('marketingChart').getContext('2d');
    const gradOriginal = ctx.createLinearGradient(0, 0, 0, 400);
    gradOriginal.addColorStop(0, 'rgba(68, 114, 196, 0.85)');
    gradOriginal.addColorStop(1, 'rgba(68, 114, 196, 0.35)');

    const gradUltimo = ctx.createLinearGradient(0, 0, 0, 400);
    gradUltimo.addColorStop(0, 'rgba(237, 125, 49, 0.9)');
    gradUltimo.addColorStop(1, 'rgba(237, 125, 49, 0.4)');

    state.charts.marketing = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: datasets.labels,
            datasets: [
                {
                    label: 'Mídia Original (1º toque)',
                    data: datasets.original,
                    backgroundColor: gradOriginal,
                    borderColor: '#4472C4',
                    borderWidth: 1,
                    borderRadius: 4,
                },
                {
                    label: 'Mídia Último (Último toque)',
                    data: datasets.ultimo,
                    backgroundColor: gradUltimo,
                    borderColor: '#ED7D31',
                    borderWidth: 1,
                    borderRadius: 4,
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    labels: { color: getChartTheme().textColor, font: { family: getChartTheme().fontFamily, size: 11, weight: '500' } }
                }
            },
            scales: {
                x: { grid: { color: getChartTheme().gridColor }, ticks: { color: getChartTheme().textColor, font: { family: getChartTheme().fontFamily, size: 10 } } },
                y: { grid: { color: getChartTheme().gridColor }, ticks: { color: getChartTheme().textColor, font: { family: getChartTheme().fontFamily, size: 10 } } }
            }
        }
    });
}

// =========================================================================
// ==================== RENDERS DA ABA 2: VISÃO DE DIRETORIA ================
// =========================================================================
function renderDirectorsView(leads) {
    let leadsAcquisition = [...leads];
    
    if (state.filters.ano !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getYearFromDateString(d)) === state.filters.ano;
        });
    }
    if (state.filters.mes !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getMonthFromDateString(d)) === state.filters.mes;
        });
    }

    const leadsStage = leadsAcquisition; // Cohort
    const totalLeads = leadsAcquisition.length;
    const vendas = leadsStage.filter(l => l.reserva === 1 || STAGE_IDS.venda.includes(l.idsituacao)).length;
    const txConversao = totalLeads > 0 ? ((vendas / totalLeads) * 100).toFixed(2) : '0.00';
    const atendimentoAtivo = leadsStage.filter(l => l.idsituacao && STAGE_IDS.atendimento.includes(l.idsituacao)).length;

    const leadsComValor = leadsAcquisition.filter(l => l.renda_familiar !== null && l.renda_familiar > 0);
    const valorMedio = leadsComValor.length > 0 
        ? Math.round(leadsComValor.reduce((acc, curr) => acc + curr.renda_familiar, 0) / leadsComValor.length)
        : 0;

    document.getElementById('dir-kpi-vendas').innerText = Number(vendas).toLocaleString('pt-BR');
    document.getElementById('dir-kpi-conversao').innerText = `${txConversao}%`;
    document.getElementById('dir-kpi-valor-negocio').innerText = `R$ ${Number(valorMedio).toLocaleString('pt-BR')}`;
    document.getElementById('dir-kpi-atendimento').innerText = Number(atendimentoAtivo).toLocaleString('pt-BR');

    const comp = calculatePeriodComparisons(leads);
    document.getElementById('dir-kpi-vendas-trend').innerHTML = comp.metrics.vendas.html;
    document.getElementById('dir-kpi-conversao-trend').innerHTML = comp.metrics.conversao.html;
    document.getElementById('dir-kpi-valor-negocio-trend').innerHTML = comp.metrics.renda.html;
    document.getElementById('dir-kpi-atendimento-trend').innerHTML = comp.metrics.atendimento.html;

    const empStats = {};
    leadsAcquisition.forEach(l => {
        const empName = l.empreendimento_ultimo || 'Desconhecido';
        if (!empStats[empName]) {
            empStats[empName] = { nome: empName, total: 0, vendas: 0 };
        }
        empStats[empName].total++;
        if (l.reserva === 1 || STAGE_IDS.venda.includes(l.idsituacao)) {
            empStats[empName].vendas++;
        }
    });

    const sortedEmpreendimentos = Object.values(empStats)
        .sort((a, b) => b.vendas - a.vendas || b.total - a.total)
        .slice(0, 5);

    const empTable = document.getElementById('dir-table-empreendimentos');
    empTable.innerHTML = '';
    sortedEmpreendimentos.forEach(item => {
        const pct = item.total > 0 ? ((item.vendas / item.total) * 100).toFixed(1) : '0.0';
        empTable.innerHTML += `
            <tr>
                <td><strong>${item.nome}</strong></td>
                <td style="text-align: center;">${Number(item.total).toLocaleString('pt-BR')}</td>
                <td style="text-align: center; color: var(--accent-green); font-weight: 700;">${item.vendas}</td>
                <td style="text-align: center; font-weight: 600;">${pct}%</td>
            </tr>
        `;
    });

    const imobStats = {};
    leadsAcquisition.forEach(l => {
        const imobName = l.imobiliaria || 'Sem Imobiliária';
        if (!imobStats[imobName]) {
            imobStats[imobName] = { nome: imobName, total: 0, vendas: 0 };
        }
        imobStats[imobName].total++;
        if (l.reserva === 1 || STAGE_IDS.venda.includes(l.idsituacao)) {
            imobStats[imobName].vendas++;
        }
    });

    const sortedImobiliarias = Object.values(imobStats)
        .sort((a, b) => b.vendas - a.vendas || b.total - a.total)
        .slice(0, 5);

    const imobTable = document.getElementById('dir-table-imobiliarias');
    imobTable.innerHTML = '';
    sortedImobiliarias.forEach(item => {
        const pct = item.total > 0 ? ((item.vendas / item.total) * 100).toFixed(1) : '0.0';
        imobTable.innerHTML += `
            <tr>
                <td><strong>${item.nome}</strong></td>
                <td style="text-align: center;">${Number(item.total).toLocaleString('pt-BR')}</td>
                <td style="text-align: center; color: var(--accent-blue); font-weight: 700;">${item.vendas}</td>
                <td style="text-align: center; font-weight: 600;">${pct}%</td>
            </tr>
        `;
    });

    // 4. Gráfico Histórico Evolução Mensal (Chart.js)
    const vendasMensais = Array(12).fill(0);
    const targetYear = state.filters.ano !== 'all' ? state.filters.ano : new Date().getFullYear().toString();
    const leadsVendaAno = leads.filter(l => {
        if (!(l.reserva === 1 || STAGE_IDS.venda.includes(l.idsituacao))) return false;
        const date = l.ultima_data_conversao || l.data_cad;
        return date && String(getYearFromDateString(date)) === targetYear;
    });
    
    leadsVendaAno.forEach(l => {
        const date = l.ultima_data_conversao || l.data_cad;
        if (date) {
            const m = getMonthFromDateString(date) - 1;
            if (m >= 0 && m < 12) vendasMensais[m]++;
        }
    });

    if (state.charts.dirSales) {
        state.charts.dirSales.destroy();
    }

    const ctx = document.getElementById('dirSalesChart').getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 0, 300);
    grad.addColorStop(0, 'rgba(237, 125, 49, 0.4)');
    grad.addColorStop(1, 'rgba(237, 125, 49, 0.0)');

    state.charts.dirSales = new Chart(ctx, {
        type: 'line',
        data: {
            labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'],
            datasets: [{
                label: 'Vendas Realizadas',
                data: vendasMensais,
                backgroundColor: grad,
                borderColor: '#ED7D31',
                borderWidth: 3,
                fill: true,
                tension: 0.35,
                pointBackgroundColor: '#ED7D31',
                pointHoverRadius: 7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { grid: { color: getChartTheme().gridColor }, ticks: { color: getChartTheme().textColor, font: { family: getChartTheme().fontFamily } } },
                y: { grid: { color: getChartTheme().gridColor }, ticks: { color: getChartTheme().textColor, precision: 0, font: { family: getChartTheme().fontFamily } } }
            }
        }
    });

    // 5. Origens das Vendas (Último Contato)
    const leadsVendasConcluidas = leadsStage.filter(l => l.reserva === 1 || STAGE_IDS.venda.includes(l.idsituacao));
    const totalVendasLeads = leadsVendasConcluidas.length;

    const origemStats = {};
    leadsVendasConcluidas.forEach(l => {
        const origemName = l.origem_ultimo_nome || 'Orgânico / Desconhecido';
        origemStats[origemName] = (origemStats[origemName] || 0) + 1;
    });

    const sortedOrigensVendas = Object.entries(origemStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const origensVendasTable = document.getElementById('dir-table-origens-vendas');
    origensVendasTable.innerHTML = '';
    
    if (sortedOrigensVendas.length === 0) {
        origensVendasTable.innerHTML = '<tr><td colspan="3" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Nenhuma venda registrada no período.</td></tr>';
    } else {
        sortedOrigensVendas.forEach(([nome, count]) => {
            const pct = totalVendasLeads > 0 ? ((count / totalVendasLeads) * 100).toFixed(1) : '0.0';
            origensVendasTable.innerHTML += `
                <tr>
                    <td><strong>${nome}</strong></td>
                    <td style="text-align: center; color: var(--accent-orange); font-weight: 700;">${count}</td>
                    <td style="text-align: center; font-weight: 600;">${pct}%</td>
                </tr>
            `;
        });
    }

    // 6. Mídias das Vendas (Último Contato) - Gráfico Horizontal
    const midiaStats = {};
    leadsVendasConcluidas.forEach(l => {
        const midiaName = l.midia_ultimo || 'Orgânico / Desconhecido';
        midiaStats[midiaName] = (midiaStats[midiaName] || 0) + 1;
    });

    const sortedMidiasVendas = Object.entries(midiaStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const midiaLabels = sortedMidiasVendas.map(x => x[0]);
    const midiaData = sortedMidiasVendas.map(x => x[1]);

    if (state.charts.dirMediaSales) {
        state.charts.dirMediaSales.destroy();
    }

    const ctxMedia = document.getElementById('dirMediaSalesChart').getContext('2d');
    const gradMedia = ctxMedia.createLinearGradient(0, 0, 400, 0);
    gradMedia.addColorStop(0, 'rgba(237, 125, 49, 0.9)');
    gradMedia.addColorStop(1, 'rgba(237, 125, 49, 0.5)');

    state.charts.dirMediaSales = new Chart(ctxMedia, {
        type: 'bar',
        data: {
            labels: midiaLabels,
            datasets: [{
                label: 'Volume de Vendas',
                data: midiaData,
                backgroundColor: gradMedia,
                borderColor: '#ED7D31',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { grid: { color: getChartTheme().gridColor }, ticks: { color: getChartTheme().textColor, precision: 0, font: { family: getChartTheme().fontFamily } } },
                y: { grid: { display: false }, ticks: { color: getChartTheme().textColor, font: { family: getChartTheme().fontFamily, size: 10 } } }
            }
        }
    });
}

// =========================================================================
// ==================== RENDERS DA ABA 3: VISÃO DE COORDENADORES ============
// =========================================================================
function renderCoordinatorsView(leads) {
    let leadsAcquisition = [...leads];
    
    if (state.filters.ano !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getYearFromDateString(d)) === state.filters.ano;
        });
    }
    if (state.filters.mes !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getMonthFromDateString(d)) === state.filters.mes;
        });
    }

    const leadsStage = leadsAcquisition; // Cohort
    const activeLeadIds = new Set(leadsAcquisition.map(l => l.idlead));
    const slaFiltered = state.data.sla.filter(s => activeLeadIds.has(s.idlead));
    
    const ociososLeadIds = new Set(
        slaFiltered.filter(s => s.dias_sem_interacao !== null && s.dias_sem_interacao > 7).map(s => s.idlead)
    );
    
    const ociososCount = ociososLeadIds.size;
    const corretoresComLead = [...new Set(leadsAcquisition.map(l => l.idcorretor).filter(Boolean))];
    const corretoresAtivos = corretoresComLead.length;
    const totalLeads = leadsAcquisition.length;
    const mediaLeadsCorretor = corretoresAtivos > 0 ? Math.round(totalLeads / corretoresAtivos) : 0;
    const vendas = leadsStage.filter(l => l.reserva === 1 || STAGE_IDS.venda.includes(l.idsituacao)).length;

    document.getElementById('coord-kpi-reatribuicao').innerText = Number(ociososCount).toLocaleString('pt-BR');
    document.getElementById('coord-kpi-corretores').innerText = Number(corretoresAtivos).toLocaleString('pt-BR');
    document.getElementById('coord-kpi-media-leads').innerText = Number(mediaLeadsCorretor).toLocaleString('pt-BR');
    document.getElementById('coord-kpi-ganhos').innerText = Number(vendas).toLocaleString('pt-BR');

    const comp = calculatePeriodComparisons(leads);
    document.getElementById('coord-kpi-reatribuicao-trend').innerHTML = comp.metrics.reatribuicao.html;
    document.getElementById('coord-kpi-corretores-trend').innerHTML = comp.metrics.corretores.html;
    document.getElementById('coord-kpi-media-leads-trend').innerHTML = comp.metrics.mediaLeads.html;
    document.getElementById('coord-kpi-ganhos-trend').innerHTML = comp.metrics.ganhos.html;

    const brokerOps = {};
    leadsAcquisition.forEach(l => {
        if (!l.idcorretor) return;
        const brokerName = l.corretor || `Corretor ${l.idcorretor}`;
        if (!brokerOps[l.idcorretor]) {
            brokerOps[l.idcorretor] = { nome: brokerName, ativo: 0, vendas: 0, ociosos: 0, total: 0 };
        }
        brokerOps[l.idcorretor].total++;
        if (ociososLeadIds.has(l.idlead)) {
            brokerOps[l.idcorretor].ociosos++;
        }
        if (l.idsituacao && STAGE_IDS.atendimento.includes(l.idsituacao) && !STAGE_IDS.venda.includes(l.idsituacao)) {
            brokerOps[l.idcorretor].ativo++;
        }
        if (l.reserva === 1 || STAGE_IDS.venda.includes(l.idsituacao)) {
            brokerOps[l.idcorretor].vendas++;
        }
    });

    const sortedBrokerOps = Object.values(brokerOps)
        .sort((a, b) => b.ativo - a.ativo || b.vendas - a.vendas)
        .slice(0, 15);

    const coordTableCorretores = document.getElementById('coord-table-corretores');
    coordTableCorretores.innerHTML = '';
    
    if (sortedBrokerOps.length === 0) {
        coordTableCorretores.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1.5rem;">Nenhum corretor com carga ativa na base.</td></tr>';
    } else {
        sortedBrokerOps.forEach(item => {
            const pct = item.total > 0 ? ((item.vendas / item.total) * 100).toFixed(1) : '0.0';
            const ociososBadge = item.ociosos > 0 
                ? `<span style="color: var(--accent-red); font-weight: bold;">${item.ociosos}</span>`
                : `<span style="color: var(--text-muted); font-weight: normal;">0</span>`;
            
            coordTableCorretores.innerHTML += `
                <tr>
                    <td><strong>${item.nome}</strong></td>
                    <td style="text-align: center; font-weight: 600;">${item.ativo}</td>
                    <td style="text-align: center; color: var(--accent-green); font-weight: 700;">${item.vendas}</td>
                    <td style="text-align: center;">${ociososBadge}</td>
                    <td style="text-align: center; font-weight: 600;">${pct}%</td>
                </tr>
            `;
        });
    }

    const ociososList = [];
    leadsAcquisition.forEach(l => {
        if (ociososLeadIds.has(l.idlead)) {
            const slaRecord = slaFiltered.find(s => s.idlead === l.idlead);
            const diasInativo = slaRecord && slaRecord.dias_sem_interacao !== null 
                ? Math.round(slaRecord.dias_sem_interacao) 
                : 8;
            ociososList.push({
                id: l.idlead,
                nome: l.nome || 'Cliente sem Nome',
                corretor: l.corretor || 'Não Atribuído',
                dias: diasInativo
            });
        }
    });

    const sortedOciosos = ociososList.sort((a, b) => b.dias - a.dias).slice(0, 10);

    const coordTableCriticos = document.getElementById('coord-table-criticos');
    coordTableCriticos.innerHTML = '';
    
    if (sortedOciosos.length === 0) {
        coordTableCriticos.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--accent-green); padding: 1.5rem;">Fila vazia! Todos os leads ativos estão saudáveis.</td></tr>';
    } else {
        sortedOciosos.forEach(item => {
            coordTableCriticos.innerHTML += `
                <tr>
                    <td><span class="badge-priority"></span> <strong>#${item.id}</strong></td>
                    <td>${item.nome}</td>
                    <td>${item.corretor}</td>
                    <td style="text-align: center; color: var(--accent-red); font-weight: 700;">${item.dias} dias</td>
                </tr>
            `;
        });
    }
}

// =========================================================================
// ==================== RENDERS DA ABA 4: SAÚDE DO CRM =====================
// =========================================================================
function renderCRMHealthView(leads) {
    let leadsAcquisition = [...leads];
    
    if (state.filters.ano !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getYearFromDateString(d)) === state.filters.ano;
        });
    }
    if (state.filters.mes !== 'all') {
        leadsAcquisition = leadsAcquisition.filter(l => {
            const d = getLeadAcquisitionDate(l);
            return d && String(getMonthFromDateString(d)) === state.filters.mes;
        });
    }

    const totalLeads = leadsAcquisition.length;
    const semCorretor = leadsAcquisition.filter(l => !l.idcorretor || l.corretor === 'Não Atribuído').length;
    
    const incompleto = leadsAcquisition.filter(l => {
        const semEmail = !l.email || l.email.trim() === '';
        const semFone = !l.telefone || l.telefone.trim() === '';
        return semEmail && semFone;
    }).length;
    
    const pctIncompleto = totalLeads > 0 ? ((incompleto / totalLeads) * 100).toFixed(1) : '0.0';

    const leadsComScore = leadsAcquisition.filter(l => l.score !== null && l.score > 0);
    const scoreMedio = leadsComScore.length > 0 
        ? (leadsComScore.reduce((acc, curr) => acc + curr.score, 0) / leadsComScore.length).toFixed(1)
        : '0.0';

    const leadsComEmpreendimento = leadsAcquisition.filter(l => l.empreendimento_ultimo && l.empreendimento_ultimo !== 'Desconhecido').length;
    const leadsComBroker = totalLeads - semCorretor;
    const leadsComContato = totalLeads - incompleto;
    
    const pctEmp = totalLeads > 0 ? (leadsComEmpreendimento / totalLeads) : 0;
    const pctBroker = totalLeads > 0 ? (leadsComBroker / totalLeads) : 0;
    const pctContato = totalLeads > 0 ? (leadsComContato / totalLeads) : 0;
    const indiceQualidade = (((pctEmp + pctBroker + pctContato) / 3) * 100).toFixed(1);

    document.getElementById('crm-kpi-sem-corretor').innerText = Number(semCorretor).toLocaleString('pt-BR');
    document.getElementById('crm-kpi-incompleto').innerText = `${pctIncompleto}%`;
    document.getElementById('crm-kpi-score').innerText = scoreMedio;
    document.getElementById('crm-kpi-saude').innerText = `${indiceQualidade}%`;

    const comp = calculatePeriodComparisons(leads);
    document.getElementById('crm-kpi-sem-corretor-trend').innerHTML = comp.metrics.semCorretor.html;
    document.getElementById('crm-kpi-incompleto-trend').innerHTML = comp.metrics.incompleto.html;
    document.getElementById('crm-kpi-score-trend').innerHTML = comp.metrics.leadScore.html;
    document.getElementById('crm-kpi-saude-trend').innerHTML = comp.metrics.saude.html;

    const descartesStats = {};
    leadsAcquisition.forEach(l => {
        if (l.motivo_cancelamento) {
            descartesStats[l.motivo_cancelamento] = (descartesStats[l.motivo_cancelamento] || 0) + 1;
        }
    });

    const sortedDescartes = Object.entries(descartesStats)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

    const chartLabels = sortedDescartes.map(x => x[0]);
    const chartData = sortedDescartes.map(x => x[1]);

    if (state.charts.crmDiscard) {
        state.charts.crmDiscard.destroy();
    }

    const ctx = document.getElementById('crmDiscardChart').getContext('2d');
    const grad = ctx.createLinearGradient(0, 0, 400, 0);
    grad.addColorStop(0, 'rgba(229, 72, 77, 0.85)');
    grad.addColorStop(1, 'rgba(229, 72, 77, 0.45)');

    state.charts.crmDiscard = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: chartLabels,
            datasets: [{
                label: 'Volume de Descarte',
                data: chartData,
                backgroundColor: grad,
                borderColor: '#C73338',
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            indexAxis: 'y',
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                x: { grid: { color: getChartTheme().gridColor }, ticks: { color: getChartTheme().textColor, precision: 0, font: { family: getChartTheme().fontFamily } } },
                y: { grid: { display: false }, ticks: { color: getChartTheme().textColor, font: { family: getChartTheme().fontFamily, size: 10 } } }
            }
        }
    });

    const auditTable = document.getElementById('crm-table-audit');
    auditTable.innerHTML = '';

    const auditMetrics = [
        {
            nome: 'Atribuição de Corretor Responsável',
            preenchidos: leadsComBroker,
            incompletos: semCorretor,
            pct: pctBroker * 100
        },
        {
            nome: 'Identidade e Canais de Contato',
            preenchidos: leadsComContato,
            incompletos: incompleto,
            pct: pctContato * 100
        },
        {
            nome: 'Indicação de Empreendimento de Interesse',
            preenchidos: leadsComEmpreendimento,
            incompletos: totalLeads - leadsComEmpreendimento,
            pct: pctEmp * 100
        },
        {
            nome: 'Qualificação de Lead Score',
            preenchidos: leadsComScore.length,
            incompletos: totalLeads - leadsComScore.length,
            pct: (totalLeads > 0 ? (leadsComScore.length / totalLeads) : 0) * 100
        }
    ];

    auditMetrics.forEach(metric => {
        let textClass = 'positive';
        if (metric.pct < 50) textClass = 'negative';
        else if (metric.pct < 85) textClass = 'neutral';
        
        auditTable.innerHTML += `
            <tr>
                <td><strong>${metric.nome}</strong></td>
                <td style="text-align: center;">${Number(metric.preenchidos).toLocaleString('pt-BR')}</td>
                <td style="text-align: center;">${Number(metric.incompletos).toLocaleString('pt-BR')}</td>
                <td style="text-align: center; font-weight: 700;" class="${textClass}">${metric.pct.toFixed(1)}%</td>
            </tr>
        `;
    });
}

// =========================================================================
// ================= CONTROLES DE INTERFACE (EVENT LISTENERS) ===============
// =========================================================================
function initEventListeners() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            const targetTab = e.currentTarget.getAttribute('data-tab');
            if (state.activeTab === targetTab) return;

            navItems.forEach(btn => btn.classList.remove('active'));
            e.currentTarget.classList.add('active');

            document.querySelectorAll('.tab-pane').forEach(pane => pane.classList.remove('active'));
            document.getElementById(`pane-${targetTab}`).classList.add('active');

            state.activeTab = targetTab;

            const headerTitle = document.getElementById('dash-main-title');
            const headerSubtitle = document.getElementById('dash-main-subtitle');
            
            const titlesMap = {
                'comercial': { t: 'Painel de Leads & Conversão Comercial', s: 'Análise histórica unificada e atribuição de canais' },
                'diretoria': { t: 'Visão Estratégica da Diretoria', s: 'Indicadores executivos, rankings de vendas e desempenho de parceiros' },
                'coordenadores': { t: 'Gestão Operacional de Coordenadores', s: 'Distribuição de leads, carga de trabalho dos corretores e fila de urgência' },
                'saude-crm': { t: 'Auditoria e Saúde do CRM', s: 'Completude de cadastros, motivos de descartes e integridade de cargas' }
            };

            headerTitle.innerText = titlesMap[targetTab].t;
            headerSubtitle.innerText = titlesMap[targetTab].s;

            applyFiltersAndRender();
        });
    });

    document.getElementById('filter-imobiliaria').addEventListener('change', (e) => {
        state.filters.imobiliaria = e.target.value;
        applyFiltersAndRender();
    });

    document.getElementById('filter-corretor').addEventListener('change', (e) => {
        state.filters.corretor = e.target.value;
        applyFiltersAndRender();
    });

    document.getElementById('filter-origem-primeira').addEventListener('change', (e) => {
        state.filters.origemPrimeira = e.target.value;
        applyFiltersAndRender();
    });

    document.getElementById('filter-origem-ultima').addEventListener('change', (e) => {
        state.filters.origemUltima = e.target.value;
        applyFiltersAndRender();
    });

    document.getElementById('filter-emp-primeiro').addEventListener('change', (e) => {
        state.filters.empPrimeiro = e.target.value;
        applyFiltersAndRender();
    });

    document.getElementById('filter-emp-ultimo').addEventListener('change', (e) => {
        state.filters.empUltimo = e.target.value;
        applyFiltersAndRender();
    });

    document.getElementById('filter-momento').addEventListener('change', (e) => {
        state.filters.momento = e.target.value;
        applyFiltersAndRender();
    });

    document.getElementById('filter-ano').addEventListener('change', (e) => {
        state.filters.ano = e.target.value;
        applyFiltersAndRender();
    });

    document.getElementById('filter-mes').addEventListener('change', (e) => {
        state.filters.mes = e.target.value;
        applyFiltersAndRender();
    });

    const filterCategories = [
        { id: 'cat-atribuicao', clearBtnId: 'clear-cat-atribuicao', filters: ['filter-imobiliaria', 'filter-corretor'], stateKeys: ['imobiliaria', 'corretor'] },
        { id: 'cat-jornada', clearBtnId: 'clear-cat-jornada', filters: ['filter-origem-primeira', 'filter-origem-ultima', 'filter-emp-primeiro', 'filter-emp-ultimo', 'filter-momento'], stateKeys: ['origemPrimeira', 'origemUltima', 'empPrimeiro', 'empUltimo', 'momento'] },
        { id: 'cat-periodo', clearBtnId: 'clear-cat-periodo', filters: ['filter-ano', 'filter-mes'], stateKeys: ['ano', 'mes'] }
    ];

    filterCategories.forEach(cat => {
        const catElement = document.getElementById(cat.id);
        if (!catElement) return;

        const header = catElement.querySelector('.category-header');
        const clearBtn = document.getElementById(cat.clearBtnId);

        if (header) {
            header.addEventListener('click', (e) => {
                if (e.target.closest('.category-clear-btn')) return;
                catElement.classList.toggle('collapsed');
            });
        }

        if (clearBtn) {
            clearBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                cat.stateKeys.forEach((key, idx) => {
                    state.filters[key] = 'all';
                    const select = document.getElementById(cat.filters[idx]);
                    if (select) select.value = 'all';
                });
                applyFiltersAndRender();
            });
        }
    });

    const funnelStages = [
        { elementId: 'funnel-stage-novo', stageName: 'Novo' },
        { elementId: 'funnel-stage-atendimento', stageName: 'Em Atendimento' },
        { elementId: 'funnel-stage-visita-agendada', stageName: 'Visita Agendada' },
        { elementId: 'funnel-stage-visita-realizada', stageName: 'Visita Realizada' },
        { elementId: 'funnel-stage-proposta', stageName: 'Proposta' },
        { elementId: 'funnel-stage-venda', stageName: 'Venda Realizada' }
    ];

    funnelStages.forEach(fs => {
        const outerBar = document.getElementById(fs.elementId);
        outerBar.addEventListener('click', () => {
            if (state.filters.stage === fs.stageName) {
                state.filters.stage = null;
            } else {
                state.filters.stage = fs.stageName;
            }
            applyFiltersAndRender();
        });
    });

    document.getElementById('btn-prev-page').addEventListener('click', () => {
        if (state.table.currentPage > 1) {
            state.table.currentPage--;
            renderLeadsTable();
        }
    });

    document.getElementById('btn-next-page').addEventListener('click', () => {
        const totalPages = Math.ceil(state.table.filteredLeads.length / state.table.pageSize);
        if (state.table.currentPage < totalPages) {
            state.table.currentPage++;
            renderLeadsTable();
        }
    });

    document.getElementById('btn-sync-data').addEventListener('click', () => {
        fetchInitialData();
    });

    document.getElementById('btn-open-settings').addEventListener('click', openModal);
    document.getElementById('btn-close-settings').addEventListener('click', closeModal);
    
    document.getElementById('btn-save-settings').addEventListener('click', () => {
        const projectRef = document.getElementById('settings-project-ref').value;
        const anonKey = document.getElementById('settings-anon-key').value;
        saveSettings(projectRef, anonKey);
    });

    document.getElementById('btn-restore-default').addEventListener('click', () => {
        if (confirm('Deseja realmente restaurar as credenciais padrão do projeto?')) {
            restoreDefaultSettings();
        }
    });

    document.getElementById('settings-modal').addEventListener('click', (e) => {
        if (e.target.id === 'settings-modal') closeModal();
    });
}

// --- AUXILIARES DE INTERFACE ---
function showLoader(text) {
    const loader = document.getElementById('loader');
    document.getElementById('loader-text').innerText = text;
    loader.classList.add('active');
}

function hideLoader() {
    document.getElementById('loader').classList.remove('active');
}

function openModal() {
    document.getElementById('settings-modal').classList.add('open');
}

function closeModal() {
    document.getElementById('settings-modal').classList.remove('open');
}

function setSyncStatus(status, text) {
    const statusEl = document.getElementById('sync-status');
    const statusText = document.getElementById('sync-text');
    statusEl.className = 'dash-badge';
    
    if (status === 'syncing') {
        statusEl.classList.add('syncing');
        statusText.innerText = text;
    } else if (status === 'synced') {
        statusText.innerText = text;
    } else if (status === 'error') {
        statusEl.style.background = 'var(--danger-soft)';
        statusEl.style.borderColor = 'color-mix(in srgb, var(--danger) 30%, transparent)';
        statusEl.style.color = 'var(--danger)';
        statusEl.querySelector('.syncing-dot').style.backgroundColor = 'var(--danger)';
        statusText.innerText = text;
    }
}
