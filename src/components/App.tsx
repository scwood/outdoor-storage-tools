import { AppShell, Title, Container } from "@mantine/core";
import InsuranceReport from "./InsuranceReport";

function App() {
  return (
    <AppShell header={{ height: 60 }} padding="md">
      <AppShell.Header>
        <Container h="100%" display="flex" style={{ alignItems: "center" }}>
          <Title order={3}>Outdoor Storage Tools</Title>
        </Container>
      </AppShell.Header>
      <AppShell.Main>
        <Container>
          <InsuranceReport />
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

export default App;
