function deployTheThing(payload) {
  console.log(`Beginning deployment of ${payload.deployment.ref} to ${payload.deployment.environment}`);

  return new Promise((resolve) => {
    setTimeout(() => {
      console.log(`Deployment of ${payload.deployment.ref} to ${payload.deployment.environment} was successful!`);

      resolve({
        environmentUrl: `https://${payload.deployment.environment}.whosecase.com`
      });
    }, 10000);
  })
}

module.exports = (robot) => {
  robot.on(
    'deployment',
    async context => {
      const octokit = context.github;
      const payload = context.payload;
      const logUrl = 'http://ec2-18-219-211-124.us-east-2.compute.amazonaws.com:32770/';

      // create pending status with link to logs
      const pendingStatusResult = await octokit.repos.createDeploymentStatus({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        id: payload.deployment.id,
        state: 'pending',
        description: `Review App Deployer received request to deploy ${payload.deployment.environment}`,
        log_url: logUrl,
        auto_inactive: true,
        headers: {
          accept: 'application/vnd.github.ant-man-preview+json'
        }
      });

      const deployResult = await deployTheThing(payload);

      const successStatusResult = await octokit.repos.createDeploymentStatus({
        owner: payload.repository.owner.login,
        repo: payload.repository.name,
        id: payload.deployment.id,
        state: 'success',
        description: `Review App Deployer successfully deployed ${payload.deployment.environment}`,
        log_url: logUrl,
        environment_url: deployResult.environmentUrl,
        auto_inactive: true,
        headers: {
          accept: 'application/vnd.github.ant-man-preview+json'
        }
      });
    }
  )
};
