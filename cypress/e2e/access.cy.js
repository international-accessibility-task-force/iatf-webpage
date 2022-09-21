
import 'cypress-axe'

const routes = ['src/index.html', 'src/views/developers.html', 'src/views/join-us.html', 'src/views/users.html'];

describe('Component accessibility test', () => {
  routes.forEach((route) => {
    const componentName = route.replace('.html', '');
    const testName = `${componentName} has no detectable accessibility violations on load`;

    it(testName, () => {
      cy.visit(route);
      cy.injectAxe();
      
      cy.get('.cypress-wrapper').each((element, index) => {
        cy.checkA11y(
          '.cypress-wrapper',
          {
            runOnly: {
              type: 'tag',
              values: ['best-practice'],
            },
          }
        );
      });
    });
  });
});