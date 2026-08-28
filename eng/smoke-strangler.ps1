# en-GB: Verifies the routed ASP.NET Core slice against real PostgreSQL, Redis, JWT and Nginx boundaries.
[CmdletBinding()]
param(
    [string]$BaseUri = 'http://localhost:8080',

    [ValidatePattern('^shiftflow-strangler-[a-z0-9][a-z0-9-]*$')]
    [string]$ComposeProjectName = 'shiftflow-strangler-validation',

    [string]$EvidencePath,

    [string]$PreviousEvidencePath,

    [switch]$ExpectRedisUnavailable,

    [switch]$ExpectRedisRecovered,

    [switch]$AllowSecurityMutation
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

if ($ExpectRedisUnavailable -and $ExpectRedisRecovered) {
    throw 'Redis unavailable and recovered expectations are mutually exclusive.'
}

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
. (Join-Path $repositoryRoot 'scripts/docker-desktop.ps1')
Assert-LocalDockerEnvironment

$baseAddress = [System.Uri]$BaseUri
if (-not $baseAddress.IsAbsoluteUri -or
    $baseAddress.Scheme -cne 'http' -or
    -not $baseAddress.IsLoopback -or
    -not [string]::IsNullOrEmpty($baseAddress.UserInfo) -or
    $baseAddress.AbsolutePath -cne '/' -or
    -not [string]::IsNullOrEmpty($baseAddress.Query) -or
    -not [string]::IsNullOrEmpty($baseAddress.Fragment)) {
    throw 'BaseUri must be a credential-free loopback HTTP origin without a path, query or fragment.'
}

function Assert-Condition {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [bool]$Condition,

        [Parameter(Mandatory)]
        [string]$Message
    )

    if (-not $Condition) {
        throw $Message
    }
}

function Invoke-Http {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Path,

        [ValidateSet('GET', 'POST')]
        [string]$Method = 'GET',

        [hashtable]$Headers = @{},

        [string]$Body
    )

    $arguments = @{
        Uri = "$($BaseUri.TrimEnd('/'))$Path"
        Method = $Method
        Headers = $Headers
        SkipHttpErrorCheck = $true
        UseBasicParsing = $true
    }
    if ($PSBoundParameters.ContainsKey('Body')) {
        $arguments['Body'] = $Body
        $arguments['ContentType'] = 'application/json'
    }

    return Invoke-WebRequest @arguments
}

function Convert-ResponseJson {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [Microsoft.PowerShell.Commands.BasicHtmlWebResponseObject]$Response
    )

    return $Response.Content | ConvertFrom-Json -Depth 100
}

function Has-Property {
    [CmdletBinding()]
    param(
        [AllowNull()]
        [object]$Value,

        [Parameter(Mandatory)]
        [string]$Name
    )

    return $null -ne $Value -and $Value.PSObject.Properties.Name -contains $Name
}

function Get-HeaderValue {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [Microsoft.PowerShell.Commands.BasicHtmlWebResponseObject]$Response,

        [Parameter(Mandatory)]
        [string]$Name
    )

    return @($Response.Headers[$Name]) | Select-Object -First 1
}

function Get-JwtPayload {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Token
    )

    $segments = $Token.Split('.')
    if ($segments.Count -ne 3) {
        throw 'The compatibility access token does not have three JWT segments.'
    }

    $payload = $segments[1].Replace('-', '+').Replace('_', '/')
    switch ($payload.Length % 4) {
        0 { }
        2 { $payload += '==' }
        3 { $payload += '=' }
        default { throw 'The compatibility access token payload is not valid base64url.' }
    }

    return [System.Text.Encoding]::UTF8.GetString(
        [System.Convert]::FromBase64String($payload)) | ConvertFrom-Json
}

function Invoke-SecurityControl {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [ValidateSet(
            'disable-role',
            'enable-role',
            'advance-credential-version',
            'restore-credential-version',
            'revoke-token')]
        [string]$Action,

        [string]$JwtId,

        [string]$CredentialVersion
    )

    $composeArguments = @(
        '--file', (Join-Path $repositoryRoot 'docker-compose.yml'),
        '--env-file', (Join-Path $repositoryRoot 'eng/workflow.env'),
        '--project-name', $ComposeProjectName,
        '--profile', 'migration'
    )
    $runArguments = @('run', '--rm', '--env', 'E2E_EMAIL', '--env', 'SMOKE_ACTION')
    $controlVariableNames = @(
        'SMOKE_ACTION',
        'SMOKE_CREDENTIAL_VERSION',
        'SMOKE_JWT_ID'
    )
    $processEnvironment = [System.Environment]::GetEnvironmentVariables(
        [System.EnvironmentVariableTarget]::Process)
    $callerEnvironment = @{}
    foreach ($name in $controlVariableNames) {
        $callerEnvironment[$name] = [pscustomobject]@{
            Exists = $processEnvironment.Contains($name)
            Value  = $processEnvironment[$name]
        }
    }

    try {
        $env:SMOKE_ACTION = $Action
        if (-not [string]::IsNullOrWhiteSpace($JwtId)) {
            $env:SMOKE_JWT_ID = $JwtId
            $runArguments += @('--env', 'SMOKE_JWT_ID')
        } else {
            Remove-Item Env:SMOKE_JWT_ID -ErrorAction SilentlyContinue
        }
        if (-not [string]::IsNullOrWhiteSpace($CredentialVersion)) {
            $env:SMOKE_CREDENTIAL_VERSION = $CredentialVersion
            $runArguments += @('--env', 'SMOKE_CREDENTIAL_VERSION')
        } else {
            Remove-Item Env:SMOKE_CREDENTIAL_VERSION -ErrorAction SilentlyContinue
        }
        $runArguments += @('migrate', 'node', 'prisma/strangler-security-control.mjs')

        $controlOutput = @(docker compose @composeArguments @runArguments)
        if ($LASTEXITCODE -ne 0) {
            throw "The disposable security control '$Action' failed."
        }
        $jsonLine = @(
            $controlOutput |
                Where-Object { $_.TrimStart().StartsWith('{', [System.StringComparison]::Ordinal) }) |
            Select-Object -Last 1
        if ([string]::IsNullOrWhiteSpace($jsonLine)) {
            throw "The disposable security control '$Action' returned no JSON evidence."
        }
        return $jsonLine | ConvertFrom-Json
    } finally {
        foreach ($name in $controlVariableNames) {
            $original = $callerEnvironment[$name]
            if ($original.Exists) {
                [System.Environment]::SetEnvironmentVariable(
                    $name,
                    $original.Value,
                    [System.EnvironmentVariableTarget]::Process)
            } else {
                Remove-Item -LiteralPath "Env:$name" -ErrorAction SilentlyContinue
            }
        }
    }
}

if ($ExpectRedisUnavailable) {
    $failureResponse = Invoke-Http -Path '/api/audit?entityType=MigrationProbe'
    $failure = Convert-ResponseJson $failureResponse
    Assert-Condition ($failureResponse.StatusCode -eq 503) 'Migrated business traffic did not fail closed while Redis was unavailable.'
    Assert-Condition ($failure.error.code -ceq 'SERVICE_UNAVAILABLE') 'Redis loss changed the fail-closed legacy error envelope.'
    Write-Output 'ASP.NET Core Redis failure smoke passed: migrated business traffic failed closed before authentication.'
    return
}

if ($ExpectRedisRecovered) {
    $recoveryResponse = Invoke-Http -Path '/api/audit?entityType=MigrationProbe'
    $recovery = Convert-ResponseJson $recoveryResponse
    Assert-Condition ($recoveryResponse.StatusCode -eq 401) 'Migrated business traffic did not recover after Redis restarted.'
    Assert-Condition ($recovery.error.code -ceq 'UNAUTHORIZED') 'Redis recovery changed the unauthenticated legacy error envelope.'
    Write-Output 'ASP.NET Core Redis recovery smoke passed: migrated business traffic reached authentication after Redis restarted.'
    return
}

$email = [System.Environment]::GetEnvironmentVariable('E2E_EMAIL')
$password = [System.Environment]::GetEnvironmentVariable('E2E_PASSWORD')
if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($password)) {
    throw 'E2E_EMAIL and E2E_PASSWORD are required in the process environment.'
}

$edgeHealth = Invoke-Http -Path '/edge-health'
$legacyHealth = Invoke-Http -Path '/health'
$webResponse = Invoke-Http -Path '/'
Assert-Condition ($edgeHealth.StatusCode -eq 200) 'The Nginx edge liveness check failed.'
Assert-Condition ($legacyHealth.StatusCode -eq 200) 'The legacy API liveness check failed.'
Assert-Condition ($webResponse.StatusCode -eq 200) 'The Next.js application is unavailable through the Nginx edge.'
Assert-Condition ($webResponse.Content.Contains('Shift-Flow', [System.StringComparison]::Ordinal)) 'The Nginx Web route did not return the Shift-Flow application.'

$openApiResponse = Invoke-Http -Path '/openapi/v1.json'
Assert-Condition ($openApiResponse.StatusCode -eq 200) 'The routed ASP.NET Core OpenAPI document is unavailable.'
$openApi = Convert-ResponseJson $openApiResponse
$auditListOperation = $openApi.paths.'/api/audit'.get
$parameterNames = @($auditListOperation.parameters | ForEach-Object { $_.name })
$expectedParameters = @('page', 'pageSize', 'entityType', 'entityId', 'action', 'actorUserId')
Assert-Condition (
    @(Compare-Object $expectedParameters $parameterNames).Count -eq 0
) 'The routed Audit query parameters do not match the documented contract.'
Assert-Condition (
    $openApi.components.securitySchemes.Bearer.scheme -ceq 'bearer'
) 'The routed OpenAPI document does not declare Bearer JWT security.'
Assert-Condition (
    $auditListOperation.security.Count -eq 1 -and
    (Has-Property $auditListOperation.security[0] 'Bearer')
) 'The routed Audit operation does not reference its documented Bearer security scheme.'

$unauthorisedResponse = Invoke-Http -Path '/api/audit?entityType=MigrationProbe'
$unauthorised = Convert-ResponseJson $unauthorisedResponse
Assert-Condition ($unauthorisedResponse.StatusCode -eq 401) 'The migrated Audit route accepted an unauthenticated request.'
Assert-Condition ($unauthorised.error.code -ceq 'UNAUTHORIZED') 'The migrated route changed the legacy unauthorised envelope.'

$loginBody = @{ email = $email; password = $password } | ConvertTo-Json -Compress
$loginResponse = Invoke-Http `
    -Path '/api/auth/login' `
    -Method POST `
    -Headers @{ Origin = $BaseUri.TrimEnd('/') } `
    -Body $loginBody
$login = Convert-ResponseJson $loginResponse
Assert-Condition ($loginResponse.StatusCode -eq 200) 'The legacy login required by the compatibility bridge failed.'
Assert-Condition (-not [string]::IsNullOrWhiteSpace($login.data.accessToken)) 'The legacy login returned no access token.'

$authorisedHeaders = @{ Authorization = "Bearer $($login.data.accessToken)" }
$auditResponse = Invoke-Http `
    -Path '/api/audit?entityType=MigrationProbe&action=STRANGLER_SMOKE&pageSize=100' `
    -Headers $authorisedHeaders
$audit = Convert-ResponseJson $auditResponse
Assert-Condition ($auditResponse.StatusCode -eq 200) 'The authenticated migrated Audit query failed.'
$tenantRows = @($audit.data.items)
Assert-Condition ($tenantRows.Count -eq 1) 'The migrated query did not return exactly one tenant-scoped fixture.'
Assert-Condition ($audit.data.total -eq 1) 'The migrated query returned an incorrect tenant-scoped total.'
Assert-Condition ($audit.data.page -eq 1) 'The migrated query changed the default page contract.'
Assert-Condition ($audit.data.pageSize -eq 100) 'The migrated query changed the requested page-size contract.'
$visible = $tenantRows[0]
Assert-Condition ($visible.entityId -ceq 'tenant-visible') 'The migrated query returned the wrong tenant fixture.'
Assert-Condition ($visible.before.safe -ceq 'retained') 'The response sanitizer removed a safe historical field.'
Assert-Condition (-not (Has-Property $visible.before 'password')) 'The response exposed a nested historical password.'
Assert-Condition (-not (Has-Property $visible.before.nested[0] 'refresh_token')) 'The response exposed a nested historical refresh token.'
Assert-Condition ($visible.before.nested[0].value -eq 7) 'The response sanitizer corrupted a safe nested value.'

$visibleDetailResponse = Invoke-Http `
    -Path '/api/audit/88888888-8888-4888-8888-888888888881' `
    -Headers $authorisedHeaders
$visibleDetail = Convert-ResponseJson $visibleDetailResponse
Assert-Condition ($visibleDetailResponse.StatusCode -eq 200) 'The migrated detail route did not return the same-tenant fixture.'
Assert-Condition ($visibleDetail.data.entityId -ceq 'tenant-visible') 'The migrated detail route returned the wrong fixture.'

$mismatchedHeaders = @{
    Authorization = "Bearer $($login.data.accessToken)"
    'x-company-id' = '77777777-7777-4777-8777-777777777777'
}
$mismatchedResponse = Invoke-Http -Path '/api/audit' -Headers $mismatchedHeaders
$mismatched = Convert-ResponseJson $mismatchedResponse
Assert-Condition ($mismatchedResponse.StatusCode -eq 403) 'The migrated route accepted a mismatched company header.'
Assert-Condition ($mismatched.error.code -ceq 'FORBIDDEN') 'The mismatched company response changed the legacy forbidden envelope.'

$crossTenantResponse = Invoke-Http `
    -Path '/api/audit/88888888-8888-4888-8888-888888888882' `
    -Headers $authorisedHeaders
$crossTenant = Convert-ResponseJson $crossTenantResponse
Assert-Condition ($crossTenantResponse.StatusCode -eq 404) 'The migrated route disclosed a cross-company Audit record.'
Assert-Condition ($crossTenant.error.code -ceq 'NOT_FOUND') 'The cross-company response changed the non-disclosing legacy envelope.'

$rateLimit = Get-HeaderValue $auditResponse 'x-rate-limit-limit'
$rateLimitRemainingValue = Get-HeaderValue $auditResponse 'x-rate-limit-remaining'
$rateLimitRemaining = 0
Assert-Condition ($rateLimit -ceq '600') 'The global rate-limit size contract is missing.'
Assert-Condition (
    [int]::TryParse($rateLimitRemainingValue, [ref]$rateLimitRemaining) -and
    $rateLimitRemaining -ge 0 -and
    $rateLimitRemaining -lt 600
) 'The global rate-limit response did not contain a bounded remaining count.'
Assert-Condition (
    -not [string]::IsNullOrWhiteSpace((Get-HeaderValue $auditResponse 'x-request-id'))
) 'The Nginx and ASP.NET Core request identifier contract is missing.'

if (-not [string]::IsNullOrWhiteSpace($PreviousEvidencePath)) {
    if (-not (Test-Path -LiteralPath $PreviousEvidencePath -PathType Leaf)) {
        throw 'The previous strangler evidence file does not exist.'
    }
    $previousEvidence = Get-Content -LiteralPath $PreviousEvidencePath -Raw | ConvertFrom-Json
    Assert-Condition (
        $rateLimitRemaining -lt [int]$previousEvidence.rateLimitRemaining
    ) 'The rate-limit counter did not survive the ASP.NET Core container recreation in Redis.'
}

if ($AllowSecurityMutation) {
    [void](Invoke-SecurityControl -Action 'disable-role')
    try {
        $roleDeniedResponse = Invoke-Http -Path '/api/audit' -Headers $authorisedHeaders
        $roleDenied = Convert-ResponseJson $roleDeniedResponse
        Assert-Condition ($roleDeniedResponse.StatusCode -eq 403) 'The migrated route trusted stale token authority after current RBAC was disabled.'
        Assert-Condition ($roleDenied.error.code -ceq 'FORBIDDEN') 'Current RBAC denial changed the legacy forbidden envelope.'
    } finally {
        [void](Invoke-SecurityControl -Action 'enable-role')
    }

    $roleRestoredResponse = Invoke-Http `
        -Path '/api/audit/88888888-8888-4888-8888-888888888881' `
        -Headers $authorisedHeaders
    Assert-Condition ($roleRestoredResponse.StatusCode -eq 200) 'The migrated route did not observe restored current PostgreSQL RBAC.'

    $issuedJwtPayload = Get-JwtPayload $login.data.accessToken
    $credentialControl = Invoke-SecurityControl -Action 'advance-credential-version'
    Assert-Condition (
        [long]$credentialControl.previousCredentialVersionMilliseconds -eq
        [long]$issuedJwtPayload.credentialVersion
    ) 'The credential-version control did not observe the version carried by the issued token.'
    Assert-Condition (
        [long]$credentialControl.advancedCredentialVersionMilliseconds -gt
        [long]$credentialControl.previousCredentialVersionMilliseconds
    ) 'The credential-version control did not read back a strictly advanced PostgreSQL value.'
    $restoreControl = $null
    try {
        $credentialDeniedResponse = Invoke-Http -Path '/api/audit' -Headers $authorisedHeaders
        $credentialDenied = Convert-ResponseJson $credentialDeniedResponse
        Assert-Condition ($credentialDeniedResponse.StatusCode -eq 401) 'The migrated route accepted a token issued before the current credential version.'
        Assert-Condition ($credentialDenied.error.code -ceq 'UNAUTHORIZED') 'Credential-version rejection changed the legacy unauthorised envelope.'
    } finally {
        $restoreControl = Invoke-SecurityControl `
            -Action 'restore-credential-version' `
            -CredentialVersion $credentialControl.previousCredentialVersion
    }
    Assert-Condition (
        [long]$restoreControl.restoredCredentialVersionMilliseconds -eq
        [long]$issuedJwtPayload.credentialVersion
    ) 'The disposable control did not restore the exact PostgreSQL credential version.'

    $restoredLoginResponse = Invoke-Http `
        -Path '/api/auth/login' `
        -Method POST `
        -Headers @{ Origin = $BaseUri.TrimEnd('/') } `
        -Body $loginBody
    $restoredLogin = Convert-ResponseJson $restoredLoginResponse
    Assert-Condition ($restoredLoginResponse.StatusCode -eq 200) 'The legacy login did not recover after restoring the disposable credential version.'
    Assert-Condition (-not [string]::IsNullOrWhiteSpace($restoredLogin.data.accessToken)) 'The restored legacy login returned no access token.'
    $restoredAuthorisedHeaders = @{
        Authorization = "Bearer $($restoredLogin.data.accessToken)"
    }
    $credentialRestoredResponse = Invoke-Http `
        -Path '/api/audit/88888888-8888-4888-8888-888888888881' `
        -Headers $restoredAuthorisedHeaders
    Assert-Condition ($credentialRestoredResponse.StatusCode -eq 200) 'The migrated route did not observe the restored PostgreSQL credential version.'

    $jwtPayload = Get-JwtPayload $restoredLogin.data.accessToken
    Assert-Condition (
        [long]$jwtPayload.credentialVersion -eq
        [long]$restoreControl.restoredCredentialVersionMilliseconds
    ) 'The restored login token did not carry the exact restored PostgreSQL credential version.'
    Assert-Condition (-not [string]::IsNullOrWhiteSpace($jwtPayload.jti)) 'The compatibility access token has no revocation identifier.'
    [void](Invoke-SecurityControl -Action 'revoke-token' -JwtId $jwtPayload.jti)
    $revokedResponse = Invoke-Http -Path '/api/audit' -Headers $restoredAuthorisedHeaders
    $revoked = Convert-ResponseJson $revokedResponse
    Assert-Condition ($revokedResponse.StatusCode -eq 401) 'The migrated route accepted a token revoked after issuance.'
    Assert-Condition ($revoked.error.code -ceq 'UNAUTHORIZED') 'Current revocation changed the legacy unauthorised envelope.'
}

$invalidHost = Invoke-Http -Path '/edge-health' -Headers @{ Host = 'untrusted.invalid' }
Assert-Condition ($invalidHost.StatusCode -eq 421) 'The Nginx edge accepted an untrusted Host header.'

$evidence = [ordered]@{
    status                  = 'PASS'
    rateLimitRemaining = $rateLimitRemaining
    securityMutationProven = [bool]$AllowSecurityMutation
}
if (-not [string]::IsNullOrWhiteSpace($EvidencePath)) {
    $resolvedEvidencePath = [System.IO.Path]::GetFullPath($EvidencePath)
    [void][System.IO.Directory]::CreateDirectory(
        [System.IO.Path]::GetDirectoryName($resolvedEvidencePath))
    [System.IO.File]::WriteAllText(
        $resolvedEvidencePath,
        ($evidence | ConvertTo-Json -Compress) + [System.Environment]::NewLine)
}

if ($AllowSecurityMutation) {
    Write-Output 'ASP.NET Core strangler smoke passed: edge routing, OpenAPI, JWT, live RBAC, credential version, revocation, tenant isolation, sanitisation and rate limiting are intact.'
} else {
    Write-Output 'ASP.NET Core strangler read-only smoke passed: edge routing, OpenAPI, JWT, tenant isolation, sanitisation and rate limiting are intact.'
}
Write-Output ($evidence | ConvertTo-Json -Compress)
