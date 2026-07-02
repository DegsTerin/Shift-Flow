/* global console, process */

import "dotenv/config";
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client.js";

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DATABASE_URL is required to run the realistic seed.");
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString })
});

const now = new Date();
const timezone = "America/Sao_Paulo";
const seedPassword = process.env.REALISTIC_SEED_PASSWORD ?? process.env.E2E_PASSWORD;
const generatedPassword = seedPassword ? null : `Sf-${randomBytes(12).toString("base64url")}!8a`;
const adminEmail =
  process.env.REALISTIC_SEED_EMAIL ?? process.env.E2E_EMAIL ?? "admin.operacoes@shiftflow.local";
const password = seedPassword ?? generatedPassword;

function bcryptRounds() {
  const rounds = Number(process.env.SEED_BCRYPT_ROUNDS ?? 12);
  return Number.isFinite(rounds) && rounds >= 10 ? rounds : 12;
}

function hoursFromNow(hours) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

function daysFromNow(days, hour = 9) {
  const date = new Date(now);
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date;
}

function shiftWindow(days, startHour, durationHours) {
  const startsAt = daysFromNow(days, startHour);
  const endsAt = new Date(startsAt.getTime() + durationHours * 60 * 60 * 1000);
  return { startsAt, endsAt };
}

async function cleanDatabase() {
  await prisma.$transaction([
    prisma.accessTokenRevocation.deleteMany(),
    prisma.authLoginAttempt.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.shiftReportActivity.deleteMany(),
    prisma.shiftReport.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.attachment.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.activityTaskHistory.deleteMany(),
    prisma.activityTask.deleteMany(),
    prisma.activityTaskColumn.deleteMany(),
    prisma.activityHistory.deleteMany(),
    prisma.activity.deleteMany(),
    prisma.shiftCoverage.deleteMany(),
    prisma.shift.deleteMany(),
    prisma.dashboardWidget.deleteMany(),
    prisma.dashboardConfiguration.deleteMany(),
    prisma.userRoleAssignment.deleteMany(),
    prisma.rolePermission.deleteMany(),
    prisma.permission.deleteMany(),
    prisma.role.deleteMany(),
    prisma.teamMember.deleteMany(),
    prisma.teamClient.deleteMany(),
    prisma.userClient.deleteMany(),
    prisma.team.deleteMany(),
    prisma.client.deleteMany(),
    prisma.userCompany.deleteMany(),
    prisma.user.deleteMany(),
    prisma.company.deleteMany()
  ]);
}

async function createUser(passwordHash, data) {
  return prisma.user.create({
    data: {
      passwordHash,
      status: "ACTIVE",
      preferredLocale: "PT_BR",
      preferredTheme: "SYSTEM",
      passwordChangedAt: now,
      lastLoginAt: data.lastLoginAt ?? null,
      ...data
    }
  });
}

async function createRole(companyId, role) {
  return prisma.role.create({
    data: {
      companyId,
      scope: role.scope ?? "COMPANY",
      isSystem: role.isSystem ?? false,
      isActive: true,
      ...role
    }
  });
}

async function linkPermissions(companyId, role, permissionsByKey, permissionKeys) {
  await prisma.rolePermission.createMany({
    data: permissionKeys.map((key) => ({
      companyId,
      roleId: role.id,
      permissionId: permissionsByKey.get(key).id
    }))
  });
}

async function createDashboard(companyId, userId, dashboardType, widgets, teamId = null) {
  const configuration = await prisma.dashboardConfiguration.create({
    data: {
      companyId,
      userId,
      dashboardType,
      teamId,
      gridColumns: 12,
      gridGap: 16,
      isDefault: true,
      metadata: {
        origem: "seed-realista",
        descricao: "Layout inicial para demonstracao operacional"
      }
    }
  });

  await prisma.dashboardWidget.createMany({
    data: widgets.map((widget, index) => ({
      companyId,
      dashboardConfigId: configuration.id,
      widgetType: widget.widgetType,
      title: widget.title,
      description: widget.description ?? null,
      gridColumn: widget.gridColumn,
      gridRow: widget.gridRow,
      gridWidth: widget.gridWidth,
      gridHeight: widget.gridHeight,
      isVisible: widget.isVisible ?? true,
      isPinned: widget.isPinned ?? false,
      order: index,
      refreshIntervalMs: widget.refreshIntervalMs ?? 60000,
      settings: { key: widget.key, filtros: widget.filtros ?? {} },
      metadata: widget.metadata ?? {}
    }))
  });

  return configuration;
}

async function createActivityScenario(context, spec, index) {
  const { company, usersByKey, clientsByKey, teamsByKey, shiftsByKey } = context;
  const assignee = usersByKey.get(spec.assigneeKey);
  const reporter = usersByKey.get(spec.reporterKey);
  const client = clientsByKey.get(spec.clientKey);
  const team = teamsByKey.get(spec.teamKey);
  const shift = shiftsByKey.get(spec.shiftKey);
  const createdAt = hoursFromNow(-index * 5 - 2);
  const completedAt = spec.status === "DONE" ? hoursFromNow(-index * 3) : null;

  const activity = await prisma.activity.create({
    data: {
      companyId: company.id,
      clientId: client.id,
      teamId: team.id,
      shiftId: shift.id,
      assigneeId: assignee?.id ?? null,
      reporterId: reporter.id,
      title: spec.title,
      description: spec.description,
      requested: spec.requested,
      performed: spec.performed,
      inProgressDetail: spec.inProgressDetail,
      pendingDetail: spec.pendingDetail,
      finalizationDetail: spec.finalizationDetail,
      observations: spec.observations,
      systemName: spec.systemName,
      serviceName: spec.serviceName,
      status: spec.status,
      priority: spec.priority,
      slaDueAt: spec.slaDueAt,
      startedAt: spec.status !== "PENDING" ? hoursFromNow(-index * 5 - 1) : null,
      completedAt,
      createdAt,
      updatedAt: completedAt ?? createdAt,
      createdById: reporter.id,
      updatedById: assignee?.id ?? reporter.id
    }
  });

  const columnSpecs = [
    { name: "A Fazer", color: "#64748b", position: 0 },
    { name: "Em Andamento", color: "#0ea5e9", position: 1 },
    { name: "Revisao", color: "#f59e0b", position: 2 },
    { name: "Concluido", color: "#16a34a", position: 3 }
  ];
  const columns = [];
  for (const column of columnSpecs) {
    columns.push(
      await prisma.activityTaskColumn.create({
        data: { ...column, companyId: company.id, activityId: activity.id }
      })
    );
  }

  const taskSpecs = spec.tasks ?? [];
  const tasks = [];
  for (const [taskIndex, taskSpec] of taskSpecs.entries()) {
    const column = columns[taskSpec.columnIndex ?? 0];
    const task = await prisma.activityTask.create({
      data: {
        companyId: company.id,
        activityId: activity.id,
        columnId: column.id,
        assigneeId: usersByKey.get(taskSpec.assigneeKey)?.id ?? assignee?.id ?? null,
        title: taskSpec.title,
        description: taskSpec.description,
        priority: taskSpec.priority ?? spec.priority,
        labels: taskSpec.labels ?? [],
        position: taskIndex,
        completedAt: taskSpec.completed ? hoursFromNow(-index) : null,
        archivedAt: taskSpec.archived ? hoursFromNow(-index + 1) : null
      }
    });
    tasks.push(task);
    await prisma.activityTaskHistory.create({
      data: {
        companyId: company.id,
        activityId: activity.id,
        taskId: task.id,
        actorUserId: reporter.id,
        type: taskSpec.historyType ?? "CREATED",
        toColumnId: column.id,
        toPosition: taskIndex,
        note: taskSpec.note ?? "Tarefa criada durante a carga realista.",
        metadata: { seed: "realistic", coluna: column.name }
      }
    });
  }

  await prisma.activityHistory.createMany({
    data: [
      {
        companyId: company.id,
        activityId: activity.id,
        actorUserId: reporter.id,
        type: "CREATED",
        note: "Atividade aberta pelo seed realista.",
        metadata: { origem: "portal operacional" },
        createdAt
      },
      {
        companyId: company.id,
        activityId: activity.id,
        actorUserId: assignee?.id ?? reporter.id,
        type: spec.status === "DONE" ? "CLOSED" : "STATUS_CHANGED",
        fromStatus: "PENDING",
        toStatus: spec.status,
        note: spec.historyNote,
        metadata: { prioridade: spec.priority },
        createdAt: hoursFromNow(-index * 4)
      }
    ]
  });

  const comments = [];
  for (const [commentIndex, comment] of (spec.comments ?? []).entries()) {
    comments.push(
      await prisma.comment.create({
        data: {
          companyId: company.id,
          activityId: activity.id,
          authorId: usersByKey.get(comment.authorKey).id,
          body: comment.body,
          editedAt: comment.edited ? hoursFromNow(-commentIndex - 1) : null,
          createdAt: hoursFromNow(-index - commentIndex)
        }
      })
    );
  }

  const attachments = [];
  for (const [attachmentIndex, attachment] of (spec.attachments ?? []).entries()) {
    attachments.push(
      await prisma.attachment.create({
        data: {
          companyId: company.id,
          activityId: activity.id,
          commentId: comments[attachment.commentIndex ?? 0]?.id ?? null,
          uploadedById: usersByKey.get(attachment.uploadedByKey).id,
          fileName: attachment.fileName,
          mimeType: attachment.mimeType,
          byteSize: BigInt(attachment.byteSize),
          storageKey: `seed/${activity.id}/${attachment.fileName}`,
          checksumSha256: attachment.checksumSha256,
          createdAt: hoursFromNow(-index - attachmentIndex)
        }
      })
    );
  }

  if (attachments[0] && tasks[0]) {
    await prisma.activityTask.update({
      where: { id: tasks[0].id },
      data: { attachmentIds: [attachments[0].id] }
    });
  }

  await prisma.notification.createMany({
    data: [
      {
        companyId: company.id,
        recipientId: assignee?.id ?? reporter.id,
        clientId: client.id,
        teamId: team.id,
        shiftId: shift.id,
        activityId: activity.id,
        type: spec.notificationType,
        priority: spec.priority === "CRITICAL" ? "HIGH" : "NORMAL",
        channel: "IN_APP",
        title: spec.notificationTitle,
        body: spec.notificationBody,
        readAt: spec.status === "DONE" ? hoursFromNow(-1) : null
      },
      {
        companyId: company.id,
        recipientId: reporter.id,
        clientId: client.id,
        teamId: team.id,
        shiftId: shift.id,
        activityId: activity.id,
        type: "COMMENT_ADDED",
        priority: "NORMAL",
        channel: "EMAIL",
        title: "Novo comentario na atividade",
        body: `A atividade ${spec.title} recebeu uma atualizacao.`
      }
    ]
  });

  return activity;
}

async function main() {
  await cleanDatabase();

  const passwordHash = await bcrypt.hash(password, bcryptRounds());

  const company = await prisma.company.create({
    data: {
      name: "Operacao Brasil 24x7",
      legalName: "ShiftFlow Operacao Brasil Ltda.",
      document: "SIM-OPERACAO-BR-001",
      timezone,
      status: "ACTIVE"
    }
  });

  const users = await Promise.all([
    createUser(passwordHash, {
      email: adminEmail,
      displayName: "Marina Azevedo",
      jobTitle: "Gerente de Operacoes",
      preferredTheme: "DARK",
      lastLoginAt: hoursFromNow(-2)
    }),
    createUser(passwordHash, {
      email: "supervisor.noc@shiftflow.local",
      displayName: "Rafael Lima",
      jobTitle: "Supervisor NOC",
      lastLoginAt: hoursFromNow(-4)
    }),
    createUser(passwordHash, {
      email: "analista.pagamentos@shiftflow.local",
      displayName: "Camila Rocha",
      jobTitle: "Analista de Pagamentos",
      preferredTheme: "LIGHT",
      lastLoginAt: hoursFromNow(-6)
    }),
    createUser(passwordHash, {
      email: "analista.identidade@shiftflow.local",
      displayName: "Thiago Nunes",
      jobTitle: "Analista IAM",
      lastLoginAt: hoursFromNow(-9)
    }),
    createUser(passwordHash, {
      email: "observador.executivo@shiftflow.local",
      displayName: "Helena Torres",
      jobTitle: "Diretora de Atendimento",
      preferredTheme: "LIGHT",
      lastLoginAt: hoursFromNow(-24)
    })
  ]);
  const [admin, supervisor, paymentsAnalyst, identityAnalyst, executiveViewer] = users;
  const usersByKey = new Map([
    ["admin", admin],
    ["supervisor", supervisor],
    ["payments", paymentsAnalyst],
    ["identity", identityAnalyst],
    ["executive", executiveViewer]
  ]);

  await prisma.userCompany.createMany({
    data: users.map((user, index) => ({
      companyId: company.id,
      userId: user.id,
      isDefault: index === 0
    }))
  });

  const clientSpecs = [
    ["banco", "Banco Aurora", "BCAUR"],
    ["varejo", "Rede Varejo Norte", "RVN"],
    ["saude", "Grupo Saude Viva", "GSV"]
  ];
  const clientsByKey = new Map();
  for (const [key, name, code] of clientSpecs) {
    const client = await prisma.client.create({
      data: {
        companyId: company.id,
        name,
        code,
        status: "ACTIVE",
        createdById: admin.id,
        updatedById: admin.id
      }
    });
    clientsByKey.set(key, client);
  }

  const teamSpecs = [
    ["noc", "NOC Corporativo", "#0ea5e9", 180],
    ["pagamentos", "Sustentacao de Pagamentos", "#16a34a", 120],
    ["iam", "Identidade e Acessos", "#f59e0b", 240]
  ];
  const teamsByKey = new Map();
  for (const [key, name, color, defaultSlaMinutes] of teamSpecs) {
    const team = await prisma.team.create({
      data: {
        companyId: company.id,
        name,
        description: `Equipe responsavel por ${name.toLowerCase()} em regime 24x7.`,
        color,
        defaultSlaMinutes,
        createdById: admin.id,
        updatedById: supervisor.id
      }
    });
    teamsByKey.set(key, team);
  }

  await prisma.teamClient.createMany({
    data: [
      ["noc", "banco"],
      ["noc", "varejo"],
      ["noc", "saude"],
      ["pagamentos", "banco"],
      ["pagamentos", "varejo"],
      ["iam", "banco"],
      ["iam", "saude"]
    ].map(([teamKey, clientKey]) => ({
      companyId: company.id,
      teamId: teamsByKey.get(teamKey).id,
      clientId: clientsByKey.get(clientKey).id
    }))
  });

  await prisma.userClient.createMany({
    data: [
      ["admin", "banco"],
      ["admin", "varejo"],
      ["admin", "saude"],
      ["supervisor", "banco"],
      ["supervisor", "varejo"],
      ["supervisor", "saude"],
      ["payments", "banco"],
      ["payments", "varejo"],
      ["identity", "banco"],
      ["identity", "saude"],
      ["executive", "banco"],
      ["executive", "varejo"],
      ["executive", "saude"]
    ].map(([userKey, clientKey]) => ({
      companyId: company.id,
      userId: usersByKey.get(userKey).id,
      clientId: clientsByKey.get(clientKey).id
    }))
  });

  await prisma.teamMember.createMany({
    data: [
      ["supervisor", "noc", "LEADER"],
      ["payments", "noc", "MEMBER"],
      ["identity", "noc", "MEMBER"],
      ["payments", "pagamentos", "LEADER"],
      ["supervisor", "pagamentos", "MEMBER"],
      ["identity", "iam", "LEADER"],
      ["supervisor", "iam", "MEMBER"]
    ].map(([userKey, teamKey, role]) => ({
      companyId: company.id,
      userId: usersByKey.get(userKey).id,
      teamId: teamsByKey.get(teamKey).id,
      role
    }))
  });

  const shiftsByKey = new Map();
  const shiftSpecs = [
    ["manha", "Turno Manha - Hoje", 0, 6, 8, "OPEN"],
    ["tarde", "Turno Tarde - Hoje", 0, 14, 8, "PLANNED"],
    ["noite", "Turno Noite - Hoje", 0, 22, 8, "PLANNED"],
    ["ontem", "Turno Fechado - Ontem", -1, 14, 8, "CLOSED"],
    ["reaberto", "Turno Reaberto - Incidente Critico", -2, 22, 8, "REOPENED"]
  ];
  for (const [key, name, dayOffset, startHour, duration, status] of shiftSpecs) {
    const { startsAt, endsAt } = shiftWindow(dayOffset, startHour, duration);
    const shift = await prisma.shift.create({
      data: {
        companyId: company.id,
        name,
        startsAt,
        endsAt,
        timezone,
        status,
        closedAt: status === "CLOSED" ? new Date(endsAt.getTime() + 30 * 60 * 1000) : null,
        reopenedAt: status === "REOPENED" ? hoursFromNow(-10) : null,
        createdById: admin.id,
        updatedById: supervisor.id
      }
    });
    shiftsByKey.set(key, shift);
  }

  await prisma.shiftCoverage.createMany({
    data: [
      ["manha", "supervisor", null, "REGULAR", "Lideranca do turno."],
      ["manha", "payments", null, "REGULAR", "Carteira de pagamentos."],
      ["manha", "identity", null, "ON_CALL", "Sobreaviso IAM."],
      ["tarde", "payments", null, "REGULAR", "Cobertura vespertina."],
      ["tarde", "identity", null, "SUBSTITUTE", "Substituicao planejada."],
      ["noite", "supervisor", null, "ON_CALL", "Escalacao noturna."],
      ["ontem", "payments", null, "REGULAR", "Turno ja encerrado."],
      ["reaberto", "identity", "payments", "SUBSTITUTE", "Substituicao durante incidente critico."],
      ["reaberto", "payments", null, "ABSENCE", "Ausencia registrada para simulacao."]
    ].map(([shiftKey, userKey, replacementForUserKey, type, note]) => ({
      companyId: company.id,
      shiftId: shiftsByKey.get(shiftKey).id,
      userId: usersByKey.get(userKey).id,
      replacementForUserId: replacementForUserKey ? usersByKey.get(replacementForUserKey).id : null,
      type,
      startsAt: shiftsByKey.get(shiftKey).startsAt,
      endsAt: shiftsByKey.get(shiftKey).endsAt,
      note
    }))
  });

  const permissionPairs = [
    ["*", "*"],
    ["dashboard", "read"],
    ["clients", "read"],
    ["clients", "write"],
    ["clients", "delete"],
    ["users", "read"],
    ["users", "write"],
    ["users", "delete"],
    ["teams", "read"],
    ["teams", "write"],
    ["teams", "delete"],
    ["shifts", "read"],
    ["shifts", "write"],
    ["shifts", "delete"],
    ["activities", "read"],
    ["activities", "write"],
    ["activities", "delete"],
    ["comments", "read"],
    ["comments", "write"],
    ["comments", "delete"],
    ["comments", "moderate"],
    ["notifications", "read"],
    ["notifications", "write"],
    ["notifications", "delete"],
    ["rbac", "read"],
    ["rbac", "write"],
    ["rbac", "delete"],
    ["reports", "read"],
    ["reports", "write"],
    ["reports", "approve"],
    ["audit", "read"]
  ];
  await prisma.permission.createMany({
    data: permissionPairs.map(([resource, action]) => ({
      companyId: company.id,
      resource,
      action,
      description: `Permissao para ${resource}:${action}`,
      isSystem: true
    }))
  });
  const permissions = await prisma.permission.findMany({ where: { companyId: company.id } });
  const permissionsByKey = new Map(
    permissions.map((permission) => [`${permission.resource}:${permission.action}`, permission])
  );

  const adminRole = await createRole(company.id, {
    name: "Administrador Operacional",
    description: "Acesso completo para parametrizacao, operacao e auditoria.",
    color: "#dc2626",
    isSystem: true
  });
  const supervisorRole = await createRole(company.id, {
    name: "Supervisor de Turno",
    description: "Coordena turnos, aprova relatorios e acompanha SLA.",
    color: "#2563eb"
  });
  const analystRole = await createRole(company.id, {
    name: "Analista Operacional",
    description: "Atua em atividades, comentarios, tarefas e notificacoes.",
    color: "#16a34a"
  });
  const viewerRole = await createRole(company.id, {
    name: "Executivo Leitura",
    description: "Acesso de leitura para paineis e relatorios.",
    color: "#7c3aed"
  });

  await linkPermissions(
    company.id,
    adminRole,
    permissionsByKey,
    permissions.map((permission) => `${permission.resource}:${permission.action}`)
  );
  await linkPermissions(company.id, supervisorRole, permissionsByKey, [
    "dashboard:read",
    "clients:read",
    "users:read",
    "teams:read",
    "teams:write",
    "shifts:read",
    "shifts:write",
    "activities:read",
    "activities:write",
    "comments:read",
    "comments:write",
    "comments:delete",
    "comments:moderate",
    "notifications:read",
    "notifications:write",
    "reports:read",
    "reports:write",
    "reports:approve",
    "audit:read"
  ]);
  await linkPermissions(company.id, analystRole, permissionsByKey, [
    "dashboard:read",
    "clients:read",
    "teams:read",
    "shifts:read",
    "activities:read",
    "activities:write",
    "comments:read",
    "comments:write",
    "notifications:read",
    "notifications:write",
    "reports:read",
    "reports:write"
  ]);
  await linkPermissions(company.id, viewerRole, permissionsByKey, [
    "dashboard:read",
    "clients:read",
    "users:read",
    "teams:read",
    "shifts:read",
    "activities:read",
    "comments:read",
    "notifications:read",
    "reports:read",
    "audit:read"
  ]);

  await prisma.userRoleAssignment.createMany({
    data: [
      ["admin", adminRole.id, null, null],
      ["supervisor", supervisorRole.id, null, "noc"],
      ["payments", analystRole.id, "banco", "pagamentos"],
      ["payments", analystRole.id, "varejo", "pagamentos"],
      ["identity", analystRole.id, "banco", "iam"],
      ["identity", analystRole.id, "saude", "iam"],
      ["executive", viewerRole.id, null, null]
    ].map(([userKey, roleId, clientKey, teamKey]) => ({
      companyId: company.id,
      userId: usersByKey.get(userKey).id,
      roleId,
      clientId: clientKey ? clientsByKey.get(clientKey).id : null,
      teamId: teamKey ? teamsByKey.get(teamKey).id : null
    }))
  });

  const activitySpecs = [
    {
      title: "Pix intermitente acima do limite contratado",
      description: "Oscilacao em autorizacoes Pix para cliente banco durante janela de pico.",
      requested: "Investigar queda de aprovacao e acionar fornecedor se necessario.",
      performed: "Validado aumento de latencia no provedor de antifraude e aberta sala de crise.",
      inProgressDetail: "Coleta de evidencias em andamento com NOC e pagamentos.",
      pendingDetail: "Aguardando retorno do provedor externo com ETA de normalizacao.",
      finalizationDetail: "Pendente de estabilizacao sustentada por 30 minutos.",
      observations: "Cenario cobre incidente critico, SLA em risco e dependencia de terceiro.",
      systemName: "Motor Pix",
      serviceName: "Autorizacao instantanea",
      status: "WAITING_THIRD_PARTY",
      priority: "CRITICAL",
      slaDueAt: hoursFromNow(0.5),
      clientKey: "banco",
      teamKey: "pagamentos",
      shiftKey: "manha",
      assigneeKey: "payments",
      reporterKey: "supervisor",
      historyNote: "Atividade movida para terceiro apos triagem.",
      notificationType: "SLA_AT_RISK",
      notificationTitle: "SLA critico em risco",
      notificationBody: "O incidente Pix precisa de acompanhamento executivo.",
      tasks: [
        {
          title: "Anexar evidencias de latencia",
          description: "Consolidar graficos e logs do provedor.",
          labels: ["sla", "fornecedor"],
          columnIndex: 1,
          assigneeKey: "payments"
        },
        {
          title: "Atualizar cliente a cada 30 minutos",
          description: "Registrar comunicacao no historico da atividade.",
          labels: ["cliente"],
          columnIndex: 0,
          assigneeKey: "supervisor"
        }
      ],
      comments: [
        {
          authorKey: "supervisor",
          body: "Cliente informado sobre impacto parcial e proxima atualizacao programada."
        },
        {
          authorKey: "payments",
          body: "Metricas anexadas. Provedor confirmou instabilidade regional."
        }
      ],
      attachments: [
        {
          uploadedByKey: "payments",
          fileName: "latencia-pix-janela-pico.csv",
          mimeType: "text/csv",
          byteSize: 18432,
          checksumSha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
        }
      ]
    },
    {
      title: "Portal B2B indisponivel com SLA vencida",
      description:
        "Usuarios corporativos nao conseguem acessar pedidos e notas fiscais no portal B2B.",
      requested: "Restaurar acesso, publicar comunicacao de incidente e atualizar diretoria.",
      performed: "Falha reproduzida no balanceador. Equipe iniciou rollback controlado.",
      inProgressDetail: "Rollback em execucao com acompanhamento do NOC e validacao do cliente.",
      pendingDetail: "SLA ja vencida. Falta confirmar recuperacao total e registrar causa raiz.",
      finalizationDetail: "Pendente ate estabilizacao e aceite do cliente.",
      observations:
        "Cenario cobre SLA vencida, incidente ativo, escalacao executiva e comunicacao recorrente.",
      systemName: "Portal B2B",
      serviceName: "Autenticacao corporativa",
      status: "IN_PROGRESS",
      priority: "CRITICAL",
      slaDueAt: hoursFromNow(-4),
      clientKey: "varejo",
      teamKey: "noc",
      shiftKey: "manha",
      assigneeKey: "supervisor",
      reporterKey: "executive",
      historyNote: "SLA vencida identificada durante a triagem executiva.",
      notificationType: "SLA_BREACHED",
      notificationTitle: "SLA vencida no Portal B2B",
      notificationBody: "O incidente permanece aberto apos o prazo contratado.",
      tasks: [
        {
          title: "Executar rollback do balanceador",
          description: "Retornar para a versao estavel e validar saude do portal.",
          labels: ["sla-vencida", "rollback"],
          columnIndex: 1,
          assigneeKey: "supervisor"
        },
        {
          title: "Publicar comunicado executivo",
          description: "Atualizar diretoria com impacto, acao e novo prazo.",
          labels: ["comunicacao", "executivo"],
          columnIndex: 0,
          assigneeKey: "admin"
        }
      ],
      comments: [
        {
          authorKey: "executive",
          body: "SLA vencida. Solicito atualizacao executiva a cada 15 minutos ate normalizacao."
        },
        {
          authorKey: "supervisor",
          body: "Rollback iniciado. Proxima validacao de saude em andamento."
        }
      ],
      attachments: [
        {
          uploadedByKey: "supervisor",
          fileName: "evidencia-sla-vencida-portal-b2b.txt",
          mimeType: "text/plain",
          byteSize: 4096,
          checksumSha256: "dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
        }
      ]
    },
    {
      title: "Consolidacao bancaria atrasada com SLA vencida",
      description:
        "Rotina de conciliacao bancaria nao concluiu no horario acordado e bloqueia relatorio financeiro.",
      requested: "Validar lote, corrigir divergencias e entregar arquivo consolidado ao cliente.",
      performed: "Divergencia encontrada em arquivo de retorno. Reprocessamento parcial iniciado.",
      inProgressDetail: "Equipe de pagamentos compara lote reprocessado com o extrato oficial.",
      pendingDetail: "SLA vencida por atraso no arquivo do banco correspondente.",
      finalizationDetail: "Pendente de validacao da tesouraria.",
      observations:
        "Cenario cobre SLA vencida por dependencia externa, cliente aguardando e tarefas internas.",
      systemName: "Conciliacao Financeira",
      serviceName: "Retorno bancario",
      status: "WAITING_CUSTOMER",
      priority: "HIGH",
      slaDueAt: hoursFromNow(-1.5),
      clientKey: "banco",
      teamKey: "pagamentos",
      shiftKey: "reaberto",
      assigneeKey: "payments",
      reporterKey: "admin",
      historyNote: "SLA vencida registrada e pendencia atribuida ao cliente.",
      notificationType: "SLA_BREACHED",
      notificationTitle: "SLA vencida na conciliacao bancaria",
      notificationBody: "A rotina financeira segue aberta apos o prazo de atendimento.",
      tasks: [
        {
          title: "Comparar retorno bancario",
          description: "Conferir linhas divergentes do arquivo de retorno.",
          labels: ["financeiro", "sla-vencida"],
          columnIndex: 1,
          assigneeKey: "payments"
        },
        {
          title: "Solicitar aceite da tesouraria",
          description: "Validar se o lote reprocessado pode ser enviado.",
          labels: ["cliente"],
          columnIndex: 2,
          assigneeKey: "supervisor"
        }
      ],
      comments: [
        {
          authorKey: "admin",
          body: "Registrar atraso como SLA vencida e manter tesouraria informada."
        },
        {
          authorKey: "payments",
          body: "Arquivo reprocessado parcialmente; aguardando confirmacao do cliente."
        }
      ],
      attachments: [
        {
          uploadedByKey: "payments",
          fileName: "divergencias-conciliacao.csv",
          mimeType: "text/csv",
          byteSize: 12288,
          checksumSha256: "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
        }
      ]
    },
    {
      title: "Revisao preventiva de acesso privilegiado",
      description: "Validacao de permissoes privilegiadas antes de janela de manutencao.",
      requested: "Conferir usuarios com papel administrativo no ambiente de saude.",
      performed: "Lista extraida, dois acessos temporarios removidos e evidencia anexada.",
      inProgressDetail: "Sem execucao pendente.",
      pendingDetail: "Aguardando aceite formal do cliente.",
      finalizationDetail: "Checklist concluido e pronto para aprovacao.",
      observations: "Cenario cobre IAM, tarefas concluidas, anexo e relatorio de turno.",
      systemName: "IAM Corporativo",
      serviceName: "Revisao de acessos",
      status: "MONITORING",
      priority: "HIGH",
      slaDueAt: hoursFromNow(3),
      clientKey: "saude",
      teamKey: "iam",
      shiftKey: "manha",
      assigneeKey: "identity",
      reporterKey: "admin",
      historyNote: "Atividade em monitoramento apos remocao dos acessos temporarios.",
      notificationType: "ACTIVITY_STATUS_CHANGED",
      notificationTitle: "Revisao de acesso em monitoramento",
      notificationBody: "A atividade IAM aguarda aceite do cliente.",
      tasks: [
        {
          title: "Validar grupos administrativos",
          description: "Comparar grupos no IAM com matriz aprovada.",
          labels: ["iam", "compliance"],
          columnIndex: 3,
          completed: true,
          assigneeKey: "identity",
          historyType: "MOVED"
        },
        {
          title: "Coletar aceite do cliente",
          description: "Registrar aceite no fechamento da atividade.",
          labels: ["cliente"],
          columnIndex: 2,
          assigneeKey: "supervisor"
        }
      ],
      comments: [
        {
          authorKey: "identity",
          body: "Acessos temporarios removidos. Evidencia de auditoria anexada."
        }
      ],
      attachments: [
        {
          uploadedByKey: "identity",
          fileName: "revisao-acessos-saude-viva.pdf",
          mimeType: "application/pdf",
          byteSize: 94208,
          checksumSha256: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
        }
      ]
    },
    {
      title: "Normalizacao de pedido preso na fila omnichannel",
      description: "Pedido de alto valor ficou retido em fila de integracao de estoque.",
      requested: "Reprocessar mensagem e confirmar baixa de estoque no ERP.",
      performed: "Mensagem reprocessada manualmente e reconciliacao executada com sucesso.",
      inProgressDetail: "Nao ha execucao ativa.",
      pendingDetail: "Sem pendencias.",
      finalizationDetail: "Pedido liberado e loja notificada.",
      observations: "Cenario cobre fechamento, comentario lido e dashboard de cliente.",
      systemName: "OMS",
      serviceName: "Fila de estoque",
      status: "DONE",
      priority: "MEDIUM",
      slaDueAt: hoursFromNow(6),
      clientKey: "varejo",
      teamKey: "noc",
      shiftKey: "ontem",
      assigneeKey: "supervisor",
      reporterKey: "payments",
      historyNote: "Atividade fechada apos reconciliacao.",
      notificationType: "SHIFT_REPORT_READY",
      notificationTitle: "Atividade concluida no turno anterior",
      notificationBody: "O item foi incluido no relatorio de passagem.",
      tasks: [
        {
          title: "Reprocessar mensagem",
          description: "Executar reenvio controlado no barramento.",
          labels: ["reprocessamento"],
          columnIndex: 3,
          completed: true,
          assigneeKey: "supervisor",
          historyType: "MOVED"
        }
      ],
      comments: [
        {
          authorKey: "payments",
          body: "Loja confirmou pedido liberado para faturamento.",
          edited: true
        }
      ],
      attachments: []
    },
    {
      title: "Criacao de usuario para operacao sazonal",
      description: "Solicitacao de acesso temporario para reforco de atendimento.",
      requested: "Criar usuario, aplicar perfil e validar primeiro acesso.",
      performed: "Cadastro iniciado com aprovacao do gestor anexada.",
      inProgressDetail: "Aguardando validacao de MFA.",
      pendingDetail: "Usuario precisa confirmar segundo fator.",
      finalizationDetail: "Sera preenchido apos primeiro login.",
      observations: "Cenario cobre atividade pendente, usuario, comentario e anexo leve.",
      systemName: "Portal de Acessos",
      serviceName: "Onboarding temporario",
      status: "PENDING",
      priority: "LOW",
      slaDueAt: hoursFromNow(18),
      clientKey: "banco",
      teamKey: "iam",
      shiftKey: "tarde",
      assigneeKey: "identity",
      reporterKey: "admin",
      historyNote: "Atividade registrada e aguardando MFA.",
      notificationType: "ACTIVITY_ASSIGNED",
      notificationTitle: "Nova atividade atribuida",
      notificationBody: "Criacao de usuario temporario aguardando validacao.",
      tasks: [
        {
          title: "Aplicar perfil de atendimento",
          description: "Perfil limitado ate o fim da operacao sazonal.",
          labels: ["acesso", "temporario"],
          columnIndex: 0,
          assigneeKey: "identity"
        }
      ],
      comments: [
        {
          authorKey: "admin",
          body: "Gestor aprovou acesso temporario ate o fim do mes."
        }
      ],
      attachments: [
        {
          uploadedByKey: "admin",
          fileName: "aprovacao-gestor.txt",
          mimeType: "text/plain",
          byteSize: 2048,
          checksumSha256: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc"
        }
      ]
    },
    {
      title: "Alarme falso de disponibilidade no aplicativo",
      description:
        "Monitor sintetico acionou indisponibilidade, mas clientes nao reportaram impacto.",
      requested: "Validar telemetria, descartar falso positivo e ajustar limiar.",
      performed: "Confirmada falha no monitor sintetico de uma regiao.",
      inProgressDetail: "Ajuste de limiar em validacao.",
      pendingDetail: "Monitoramento por duas coletas adicionais.",
      finalizationDetail: "Fechamento apos estabilidade do alarme.",
      observations: "Cenario cobre monitoramento e auditoria tecnica.",
      systemName: "Observabilidade",
      serviceName: "Monitor sintetico",
      status: "IN_PROGRESS",
      priority: "MEDIUM",
      slaDueAt: hoursFromNow(2),
      clientKey: "varejo",
      teamKey: "noc",
      shiftKey: "manha",
      assigneeKey: "supervisor",
      reporterKey: "executive",
      historyNote: "Monitoramento ajustado e em validacao.",
      notificationType: "ACTIVITY_STATUS_CHANGED",
      notificationTitle: "Alarme em tratamento",
      notificationBody: "O NOC esta validando falso positivo no monitor sintetico.",
      tasks: [
        {
          title: "Comparar regioes do monitor",
          description: "Conferir diferenca entre monitor externo e APM.",
          labels: ["observabilidade"],
          columnIndex: 1,
          assigneeKey: "supervisor"
        },
        {
          title: "Documentar ajuste de limiar",
          description: "Registrar antes e depois para auditoria.",
          labels: ["auditoria"],
          columnIndex: 0,
          assigneeKey: "supervisor"
        }
      ],
      comments: [
        {
          authorKey: "supervisor",
          body: "Nenhum chamado do cliente ate o momento. Seguimos em monitoramento."
        }
      ],
      attachments: []
    },
    {
      title: "Cancelamento de manutencao por conflito de janela",
      description: "Mudanca planejada conflitou com fechamento financeiro do cliente.",
      requested: "Cancelar execucao e reagendar com aprovacao do CAB.",
      performed: "Mudanca cancelada antes do inicio e partes notificadas.",
      inProgressDetail: "Nao aplicavel.",
      pendingDetail: "Aguardar nova data aprovada.",
      finalizationDetail: "Cancelamento registrado sem impacto operacional.",
      observations: "Cenario cobre status cancelado, relatorio e auditoria.",
      systemName: "Change Management",
      serviceName: "Janela de manutencao",
      status: "CANCELLED",
      priority: "HIGH",
      slaDueAt: hoursFromNow(24),
      clientKey: "banco",
      teamKey: "noc",
      shiftKey: "reaberto",
      assigneeKey: "supervisor",
      reporterKey: "admin",
      historyNote: "Atividade cancelada por conflito de janela.",
      notificationType: "SYSTEM",
      notificationTitle: "Mudanca cancelada",
      notificationBody: "A janela sera reagendada apos aprovacao do CAB.",
      tasks: [
        {
          title: "Registrar cancelamento no CAB",
          description: "Anotar motivo e proxima janela sugerida.",
          labels: ["mudanca"],
          columnIndex: 3,
          completed: true,
          archived: true,
          assigneeKey: "supervisor",
          historyType: "ARCHIVED"
        }
      ],
      comments: [
        {
          authorKey: "admin",
          body: "Cancelamento aprovado para evitar risco no fechamento financeiro."
        }
      ],
      attachments: []
    }
  ];

  const activities = [];
  for (const [index, spec] of activitySpecs.entries()) {
    activities.push(
      await createActivityScenario(
        { company, usersByKey, clientsByKey, teamsByKey, shiftsByKey },
        spec,
        index + 1
      )
    );
  }
  const overdueActivities = activities.filter(
    (activity) =>
      !["DONE", "CANCELLED"].includes(activity.status) &&
      activity.slaDueAt &&
      activity.slaDueAt.getTime() < now.getTime()
  );

  const report = await prisma.shiftReport.create({
    data: {
      companyId: company.id,
      shiftId: shiftsByKey.get("ontem").id,
      teamId: teamsByKey.get("noc").id,
      authorId: supervisor.id,
      approvedById: admin.id,
      status: "APPROVED",
      summary:
        "Turno encerrado com um incidente resolvido, uma mudanca cancelada sem impacto e acompanhamento preventivo de alarmes.",
      pendingNotes:
        "Manter monitoramento do Pix e confirmar nova janela de manutencao com o Banco Aurora.",
      metrics: {
        totalAtividades: activities.length,
        concluidas: activities.filter((activity) => activity.status === "DONE").length,
        criticas: activities.filter((activity) => activity.priority === "CRITICAL").length,
        slaVencidas: overdueActivities.length,
        slaEmRisco: activities.filter(
          (activity) =>
            !["DONE", "CANCELLED"].includes(activity.status) &&
            activity.slaDueAt &&
            activity.slaDueAt.getTime() <= hoursFromNow(1).getTime()
        ).length
      },
      submittedAt: hoursFromNow(-12),
      approvedAt: hoursFromNow(-11)
    }
  });

  await prisma.shiftReportActivity.createMany({
    data: activities.slice(0, 4).map((activity) => ({
      companyId: company.id,
      shiftReportId: report.id,
      activityId: activity.id
    }))
  });

  await prisma.auditLog.createMany({
    data: [
      {
        companyId: company.id,
        actorUserId: admin.id,
        entityType: "Company",
        entityId: company.id,
        action: "SEED_REALISTIC_DATABASE",
        after: { empresa: company.name, usuarios: users.length },
        requestId: "seed-realistic-001",
        ipAddress: "127.0.0.1",
        userAgent: "prisma/realistic-seed"
      },
      {
        companyId: company.id,
        clientId: clientsByKey.get("banco").id,
        teamId: teamsByKey.get("pagamentos").id,
        shiftId: shiftsByKey.get("manha").id,
        activityId: activities[0].id,
        actorUserId: supervisor.id,
        entityType: "Activity",
        entityId: activities[0].id,
        action: "ESCALATE_SLA_RISK",
        before: { status: "IN_PROGRESS" },
        after: { status: activities[0].status, prioridade: activities[0].priority },
        requestId: "seed-realistic-002",
        ipAddress: "127.0.0.1",
        userAgent: "prisma/realistic-seed"
      },
      {
        companyId: company.id,
        clientId: overdueActivities[0]?.clientId ?? clientsByKey.get("varejo").id,
        teamId: overdueActivities[0]?.teamId ?? teamsByKey.get("noc").id,
        shiftId: overdueActivities[0]?.shiftId ?? shiftsByKey.get("manha").id,
        activityId: overdueActivities[0]?.id ?? activities[0].id,
        actorUserId: supervisor.id,
        entityType: "Activity",
        entityId: overdueActivities[0]?.id ?? activities[0].id,
        action: "REGISTER_SLA_BREACH",
        before: { sla: "em_risco" },
        after: { sla: "vencida", totalSlaVencidas: overdueActivities.length },
        requestId: "seed-realistic-003",
        ipAddress: "127.0.0.1",
        userAgent: "prisma/realistic-seed"
      },
      {
        companyId: company.id,
        teamId: teamsByKey.get("noc").id,
        shiftId: shiftsByKey.get("ontem").id,
        shiftReportId: report.id,
        actorUserId: admin.id,
        entityType: "ShiftReport",
        entityId: report.id,
        action: "APPROVE",
        after: { status: "APPROVED" },
        requestId: "seed-realistic-004",
        ipAddress: "127.0.0.1",
        userAgent: "prisma/realistic-seed"
      }
    ]
  });

  const mainWidgets = [
    ["summary-total", "SUMMARY_CARD", "Atividades totais", 1, 1, 2, 2],
    ["summary-pending", "SUMMARY_CARD", "Pendentes", 3, 1, 2, 2],
    ["summary-running", "SUMMARY_CARD", "Em andamento", 5, 1, 2, 2],
    ["summary-done", "SUMMARY_CARD", "Finalizadas", 7, 1, 2, 2],
    ["summary-critical", "SUMMARY_CARD", "Criticas", 9, 1, 2, 2],
    ["summary-risk", "INDICATOR", "SLA em risco", 11, 1, 2, 2],
    ["chart-team", "BAR_CHART", "Atividades por equipe", 1, 3, 6, 3],
    ["chart-client", "BAR_CHART", "Atividades por cliente", 7, 3, 6, 3],
    ["chart-priority", "BAR_CHART", "Atividades por prioridade", 1, 6, 6, 3],
    ["activity-list", "RECENT_ACTIVITIES", "Ultimas atividades", 1, 9, 12, 4]
  ].map(([key, widgetType, title, gridColumn, gridRow, gridWidth, gridHeight]) => ({
    key,
    widgetType,
    title,
    gridColumn,
    gridRow,
    gridWidth,
    gridHeight
  }));
  const teamWidgets = [
    ["team-summary", "LIST", "Equipes", 1, 1, 12, 2],
    ["team-productivity", "BAR_CHART", "Produtividade por analista", 1, 3, 6, 3],
    ["team-risk", "BAR_CHART", "SLA em risco", 7, 3, 6, 3],
    ["team-activity-list", "RECENT_ACTIVITIES", "Ultimas atividades", 1, 6, 12, 4]
  ].map(([key, widgetType, title, gridColumn, gridRow, gridWidth, gridHeight]) => ({
    key,
    widgetType,
    title,
    gridColumn,
    gridRow,
    gridWidth,
    gridHeight
  }));

  await createDashboard(company.id, admin.id, "MAIN", mainWidgets);
  await createDashboard(company.id, admin.id, "TEAM", teamWidgets, teamsByKey.get("noc").id);
  await createDashboard(
    company.id,
    supervisor.id,
    "TEAM",
    teamWidgets,
    teamsByKey.get("pagamentos").id
  );
  await createDashboard(company.id, executiveViewer.id, "EXECUTIVE", mainWidgets);

  const counts = {
    companies: await prisma.company.count(),
    users: await prisma.user.count(),
    clients: await prisma.client.count(),
    teams: await prisma.team.count(),
    shifts: await prisma.shift.count(),
    activities: await prisma.activity.count(),
    activityTasks: await prisma.activityTask.count(),
    comments: await prisma.comment.count(),
    attachments: await prisma.attachment.count(),
    notifications: await prisma.notification.count(),
    shiftReports: await prisma.shiftReport.count(),
    auditLogs: await prisma.auditLog.count(),
    dashboardConfigurations: await prisma.dashboardConfiguration.count(),
    dashboardWidgets: await prisma.dashboardWidget.count(),
    slaVencidas: await prisma.activity.count({
      where: {
        deletedAt: null,
        status: { notIn: ["DONE", "CANCELLED"] },
        slaDueAt: { lt: now }
      }
    })
  };

  console.log(
    JSON.stringify(
      {
        status: "ok",
        message: "Banco limpo e populado com dados realistas em portugues.",
        login: {
          email: adminEmail,
          passwordSource: generatedPassword ? "generated-runtime" : "environment",
          password: generatedPassword ?? "(definida por REALISTIC_SEED_PASSWORD ou E2E_PASSWORD)"
        },
        companyId: company.id,
        counts
      },
      null,
      2
    )
  );
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
