import { AppShell, Title, Container, Divider, Stack } from "@mantine/core";
import InsuranceReport from "./InsuranceReport";
import UnitReconciler from "./UnitReconciler";

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
          <Stack gap="xl">
            <InsuranceReport />
            <Divider />
            <UnitReconciler />
          </Stack>
        </Container>
      </AppShell.Main>
    </AppShell>
  );
}

export default App;
