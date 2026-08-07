@{
  Agents = @(
    @{
      Agent = "narada.architect"
      Title = "Narada Architect"
      Site = "narada"
      NaradaRoot = "C:\workspace\narada"
      WorkspaceRoot = "C:\workspace\narada"
      SiteRoot = "C:\workspace\narada"
      Launcher = "narada.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada.builder"
      Title = "Narada Builder"
      Site = "narada"
      NaradaRoot = "C:\workspace\narada"
      WorkspaceRoot = "C:\workspace\narada"
      SiteRoot = "C:\workspace\narada"
      Launcher = "narada.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada.resident"
      Title = "Narada Resident"
      Site = "narada"
      NaradaRoot = "C:\workspace\narada"
      WorkspaceRoot = "C:\workspace\narada"
      SiteRoot = "C:\workspace\narada"
      Launcher = "narada.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "andrey-user.Kevin"
      Title = "Kevin"
      NaradaRoot = "C:\Users\Andrey\Narada"
      WorkspaceRoot = "C:\Users\Andrey\Narada"
      SiteRoot = "C:\Users\Andrey\Narada"
      Launcher = "andrey-user.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "andrey-user.Bob"
      Title = "Bob"
      NaradaRoot = "C:\Users\Andrey\Narada"
      WorkspaceRoot = "C:\Users\Andrey\Narada"
      SiteRoot = "C:\Users\Andrey\Narada"
      Launcher = "andrey-user.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "andrey-user.Robin"
      Title = "Robin"
      NaradaRoot = "C:\Users\Andrey\Narada"
      WorkspaceRoot = "C:\Users\Andrey\Narada"
      SiteRoot = "C:\Users\Andrey\Narada"
      Launcher = "andrey-user.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "andrey-user.resident"
      Title = "Andrey Resident"
      NaradaRoot = "C:\Users\Andrey\Narada"
      WorkspaceRoot = "C:\Users\Andrey\Narada"
      SiteRoot = "C:\Users\Andrey\Narada"
      Launcher = "andrey-user.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-staccato.architect"
      Title = "Staccato Architect"
      NaradaRoot = "C:\workspace\narada.staccato"
      WorkspaceRoot = "C:\workspace\narada.staccato"
      SiteRoot = "C:\workspace\narada.staccato\.narada"
      Launcher = "narada-staccato.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-staccato.builder"
      Title = "Staccato Builder"
      NaradaRoot = "C:\workspace\narada.staccato"
      WorkspaceRoot = "C:\workspace\narada.staccato"
      SiteRoot = "C:\workspace\narada.staccato\.narada"
      Launcher = "narada-staccato.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-staccato.resident"
      Title = "Staccato Resident"
      NaradaRoot = "C:\workspace\narada.staccato"
      WorkspaceRoot = "C:\workspace\narada.staccato"
      SiteRoot = "C:\workspace\narada.staccato\.narada"
      Launcher = "narada-staccato.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-revolution.architect"
      Title = "Revolution Architect"
      NaradaRoot = "C:\workspace\narada.revolution"
      WorkspaceRoot = "C:\workspace\narada.revolution"
      SiteRoot = "C:\workspace\narada.revolution"
      Launcher = ".narada\narada-revolution.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-revolution.builder"
      Title = "Revolution Builder"
      NaradaRoot = "C:\workspace\narada.revolution"
      WorkspaceRoot = "C:\workspace\narada.revolution"
      SiteRoot = "C:\workspace\narada.revolution"
      Launcher = ".narada\narada-revolution.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-revolution.builder2"
      Title = "Revolution Builder 2"
      NaradaRoot = "C:\workspace\narada.revolution"
      WorkspaceRoot = "C:\workspace\narada.revolution"
      SiteRoot = "C:\workspace\narada.revolution"
      Launcher = ".narada\narada-revolution.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-revolution.resident"
      Title = "Revolution Resident"
      NaradaRoot = "C:\workspace\narada.revolution"
      WorkspaceRoot = "C:\workspace\narada.revolution"
      SiteRoot = "C:\workspace\narada.revolution"
      Launcher = ".narada\narada-revolution.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-timour-marketing-agent.architect"
      Title = "Timour Marketing Agent Architect"
      NaradaRoot = "C:\workspace\narada.timour-marketing-agent"
      WorkspaceRoot = "C:\workspace\narada.timour-marketing-agent"
      SiteRoot = "C:\workspace\narada.timour-marketing-agent\.narada"
      Launcher = "narada-timour-marketing-agent.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-timour-marketing-agent.builder"
      Title = "Timour Marketing Agent Builder"
      NaradaRoot = "C:\workspace\narada.timour-marketing-agent"
      WorkspaceRoot = "C:\workspace\narada.timour-marketing-agent"
      SiteRoot = "C:\workspace\narada.timour-marketing-agent\.narada"
      Launcher = "narada-timour-marketing-agent.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-timour-marketing-agent.builder2"
      Title = "Timour Marketing Agent Builder 2"
      NaradaRoot = "C:\workspace\narada.timour-marketing-agent"
      WorkspaceRoot = "C:\workspace\narada.timour-marketing-agent"
      SiteRoot = "C:\workspace\narada.timour-marketing-agent\.narada"
      Launcher = "narada-timour-marketing-agent.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-timour-marketing-agent.resident"
      Title = "Timour Marketing Agent Resident"
      NaradaRoot = "C:\workspace\narada.timour-marketing-agent"
      WorkspaceRoot = "C:\workspace\narada.timour-marketing-agent"
      SiteRoot = "C:\workspace\narada.timour-marketing-agent\.narada"
      Launcher = "narada-timour-marketing-agent.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-utz.architect"
      Title = "Utz Architect"
      NaradaRoot = "C:\workspace\narada.utz"
      WorkspaceRoot = "C:\workspace\narada.utz"
      SiteRoot = "C:\workspace\narada.utz\.narada"
      Launcher = "narada-utz.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-utz.builder"
      Title = "Utz Builder"
      NaradaRoot = "C:\workspace\narada.utz"
      WorkspaceRoot = "C:\workspace\narada.utz"
      SiteRoot = "C:\workspace\narada.utz\.narada"
      Launcher = "narada-utz.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "narada-utz.resident"
      Title = "Utz Resident"
      NaradaRoot = "C:\workspace\narada.utz"
      WorkspaceRoot = "C:\workspace\narada.utz"
      SiteRoot = "C:\workspace\narada.utz\.narada"
      Launcher = "narada-utz.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "sonar.architect"
      Title = "Sonar Architect"
      NaradaRoot = "C:\workspace\narada.sonar"
      WorkspaceRoot = "C:\workspace\narada.sonar"
      SiteRoot = "C:\workspace\narada.sonar"
      Launcher = "narada-sonar.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "sonar.builder"
      Title = "Sonar Builder"
      NaradaRoot = "C:\workspace\narada.sonar"
      WorkspaceRoot = "C:\workspace\narada.sonar"
      SiteRoot = "C:\workspace\narada.sonar"
      Launcher = "narada-sonar.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "sonar.resident"
      Title = "Sonar Resident"
      NaradaRoot = "C:\workspace\narada.sonar"
      WorkspaceRoot = "C:\workspace\narada.sonar"
      SiteRoot = "C:\workspace\narada.sonar"
      Launcher = "narada-sonar.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "smart-scheduling.architect"
      Title = "Smart Scheduling Architect"
      NaradaRoot = "C:\workspace\smart-scheduling"
      WorkspaceRoot = "C:\workspace\smart-scheduling"
      SiteRoot = "C:\workspace\smart-scheduling\.narada"
      Launcher = "narada-smart-scheduling.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "smart-scheduling.builder"
      Title = "Smart Scheduling Builder"
      NaradaRoot = "C:\workspace\smart-scheduling"
      WorkspaceRoot = "C:\workspace\smart-scheduling"
      SiteRoot = "C:\workspace\smart-scheduling\.narada"
      Launcher = "narada-smart-scheduling.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "smart-scheduling.resident"
      Title = "Smart Scheduling Resident"
      NaradaRoot = "C:\workspace\smart-scheduling"
      WorkspaceRoot = "C:\workspace\smart-scheduling"
      SiteRoot = "C:\workspace\smart-scheduling\.narada"
      Launcher = "narada-smart-scheduling.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "thoughts-project.architect"
      Title = "Thoughts Project Architect"
      NaradaRoot = "C:\workspace\thoughts"
      WorkspaceRoot = "C:\workspace\thoughts"
      SiteRoot = "C:\workspace\thoughts\.narada"
      Launcher = "narada-thoughts.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "thoughts-project.builder"
      Title = "Thoughts Project Builder"
      NaradaRoot = "C:\workspace\thoughts"
      WorkspaceRoot = "C:\workspace\thoughts"
      SiteRoot = "C:\workspace\thoughts\.narada"
      Launcher = "narada-thoughts.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
    @{
      Agent = "thoughts-project.resident"
      Title = "Thoughts Project Resident"
      NaradaRoot = "C:\workspace\thoughts"
      WorkspaceRoot = "C:\workspace\thoughts"
      SiteRoot = "C:\workspace\thoughts\.narada"
      Launcher = "narada-thoughts.ps1"
      Carrier = "agent-cli"
      Runtime = "narada-agent-runtime-server"
      EnableNativeShell = $false
    }
  )
}



